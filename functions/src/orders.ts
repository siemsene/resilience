import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, OrderMap, SessionDoc, PlayerStateDoc } from './types';
import { processRound } from './gameLogic';
import { getCurrentSupplierMaxOrder } from './orderLimits';

const db = admin.firestore();

export const submitOrders = onCall(async (request) => {
  const { sessionId, playerId, orders } = request.data;

  if (!sessionId || !playerId || !orders) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const sessionRef = db.collection('sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const session = sessionSnap.data()!;

    if (session.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Game is not active');
    }

    if (session.currentPhase !== 'ordering') {
      throw new HttpsError('failed-precondition', 'Not in ordering phase');
    }

    if (!session.players[playerId]) {
      throw new HttpsError('not-found', 'Player not found');
    }

    if (session.submittedPlayers?.includes(playerId)) {
      throw new HttpsError('already-exists', 'Orders already submitted for this round');
    }

    // Get player state for validation
    const playerStateRef = db.collection('sessions').doc(sessionId)
      .collection('playerStates').doc(playerId);
    const playerStateSnap = await transaction.get(playerStateRef);

    if (!playerStateSnap.exists) {
      throw new HttpsError('not-found', 'Player state not found');
    }

    const playerState = playerStateSnap.data()!;
    const orderMap = orders as OrderMap;
    const minimumOrder = session.params.minimumOrder ?? 100;

    // Validate orders
    for (const key of SUPPLIER_KEYS) {
      const val = orderMap[key] || 0;
      if (val < 0 || !Number.isInteger(val)) {
        throw new HttpsError('invalid-argument', `Invalid order for ${key}`);
      }

      if (val > 0 && val < minimumOrder) {
        throw new HttpsError('invalid-argument',
          `Order for ${key} must be at least ${minimumOrder} units or 0`);
      }

      const country = SUPPLIER_COUNTRY[key];

      // Check disruption — can't order from disrupted country
      if (session.activeDisruptions[country] && val > 0) {
        throw new HttpsError('invalid-argument',
          `Cannot order from ${country} — supply disrupted`);
      }

      // Validate order constraints
      const supplierState = playerState.suppliers?.[key];
      if (supplierState?.active) {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState);
        if (val > maxOrder) {
          throw new HttpsError('invalid-argument',
            `Order for ${key} exceeds max (${maxOrder}). Last order: ${supplierState.lastOrder}`);
        }
      } else {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState);
        if (val > maxOrder) {
          throw new HttpsError('invalid-argument',
            `New supplier ${key} limited to ${maxOrder} units`);
        }
      }
    }

    // Write order to subcollection
    const orderRef = db.collection('sessions').doc(sessionId)
      .collection('rounds').doc(String(session.currentRound))
      .collection('orders').doc(playerId);
    transaction.set(orderRef, { orders: orderMap, submittedAt: Date.now() });

    // Update submitted players
    const newSubmitted = [...(session.submittedPlayers || []), playerId];
    const allSubmitted = newSubmitted.length === Object.keys(session.players).length;

    if (!allSubmitted) {
      transaction.update(sessionRef, { submittedPlayers: newSubmitted });
      return { success: true, roundProcessed: false };
    }

    // All players submitted — process the round
    transaction.update(sessionRef, {
      submittedPlayers: newSubmitted,
      currentPhase: 'processing',
    });

    return { success: true, roundProcessed: true };
  }).then(async (result) => {
    if (result.roundProcessed) {
      await executeRoundProcessing(sessionId);
    }
    return result;
  });
});

async function executeRoundProcessing(sessionId: string) {
  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  const session = sessionSnap.data()!;
  const round = session.currentRound;

  // Get all player states
  const playerStatesSnap = await db.collection('sessions').doc(sessionId)
    .collection('playerStates').get();

  // Get all orders for this round
  const ordersSnap = await db.collection('sessions').doc(sessionId)
    .collection('rounds').doc(String(round))
    .collection('orders').get();

  const ordersMap: Record<string, OrderMap> = {};
  ordersSnap.forEach((doc) => {
    ordersMap[doc.id] = doc.data().orders;
  });

  const playerRoundData = playerStatesSnap.docs.map((doc) => ({
    playerId: doc.id,
    orders: ordersMap[doc.id] || {},
    state: { ...doc.data() as PlayerStateDoc },
  }));

  const { updatedStates, newActiveDisruptions, newTotalMarketDemand, gameCompleted } =
    processRound(
      round,
      playerRoundData,
      session.params,
      session.disruptionSchedule,
      session.activeDisruptions,
    );

  // Batch write all updates
  const batch = db.batch();

  for (const [pid, state] of Object.entries(updatedStates)) {
    const ref = db.collection('sessions').doc(sessionId)
      .collection('playerStates').doc(pid);
    batch.update(ref, state);
  }

  const nextRound = round + 1;

  // Check for next round's disruptions
  const nextActiveDisruptions = { ...newActiveDisruptions };
  if (!gameCompleted) {
    for (const country of ['china', 'mexico', 'us'] as const) {
      // Clear expired
      if (nextActiveDisruptions[country] && nextRound > nextActiveDisruptions[country]!.endsAfterRound) {
        nextActiveDisruptions[country] = null;
      }
      // Start new
      if (session.disruptionSchedule[country]?.includes(nextRound)) {
        nextActiveDisruptions[country] = {
          startRound: nextRound,
          endsAfterRound: nextRound + session.params.disruptionDuration - 1,
        };
      }
    }
  }

  const sessionUpdate: Partial<SessionDoc> = {
    activeDisruptions: nextActiveDisruptions,
    totalMarketDemand: newTotalMarketDemand,
    currentPhase: 'results',
  };

  if (gameCompleted) {
    sessionUpdate.status = 'completed';
  } else {
    sessionUpdate.currentRound = nextRound;
    sessionUpdate.currentPhase = 'ordering';
    sessionUpdate.submittedPlayers = [];
  }

  batch.update(sessionRef, sessionUpdate);
  await batch.commit();
}
