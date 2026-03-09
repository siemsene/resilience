import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  SUPPLIER_KEYS,
  SUPPLIER_COUNTRY,
  SUPPLIER_RELIABLE,
  SupplierState,
  ActiveDisruption,
  OrderMap,
  SessionDoc,
  PlayerStateDoc,
  Country,
  SupplierKey,
} from './types';
import { calculateUnitCost } from './gameLogic';
import { getInitialSupplierMaxOrder } from './orderLimits';

const db = admin.firestore();

export const forceAdvance = onCall(async (request) => {
  const { sessionId } = request.data;
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data()!;

  if (session.instructorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the instructor can force advance');
  }

  if (session.status === 'setup') {
    // Force-submit default setup for unsubmitted players
    const submitted = new Set(session.submittedPlayers || []);
    const allPlayerIds = Object.keys(session.players);
    const unsubmitted = allPlayerIds.filter(id => !submitted.has(id));

    for (const playerId of unsubmitted) {
      // Create a default even distribution
      const perSupplier = Math.floor(session.params.startingDemand / 6);
      const remainder = session.params.startingDemand - (perSupplier * 6);

      const allocations = {} as Record<SupplierKey, number>;
      SUPPLIER_KEYS.forEach((key, i) => {
        allocations[key] = perSupplier + (i < remainder ? 1 : 0);
      });

      // Call submitInitialSetup logic inline (simplified)
      const playerStateRef = db.collection('sessions').doc(sessionId)
        .collection('playerStates').doc(playerId);

      const transit: Record<Country, number[]> = {
        china: new Array(session.params.transitTurns.china).fill(0),
        mexico: new Array(session.params.transitTurns.mexico).fill(0),
        us: new Array(session.params.transitTurns.us).fill(0),
      };

      const suppliers = {} as Record<SupplierKey, SupplierState>;
      let totalCost = 0;

      for (const key of SUPPLIER_KEYS) {
        const amount = allocations[key] || 0;
        const country = SUPPLIER_COUNTRY[key];
        const isUnreliable = !SUPPLIER_RELIABLE[key];
        const transitTurns = session.params.transitTurns[country];

        suppliers[key] = {
          lastOrder: amount,
          maxOrder: getInitialSupplierMaxOrder(amount),
          totalOrdered: amount * transitTurns,
          active: amount > 0,
        };

        for (let i = 0; i < transitTurns; i++) {
          transit[country][i] += amount;
        }

        if (amount > 0) {
          const unitCost = calculateUnitCost(
            session.params.baseCost[country],
            isUnreliable,
            session.params.unreliableCostModifier,
            amount,
            session.params.volumeDiscountThresholds,
          );
          totalCost += amount * transitTurns * unitCost;
        }
      }

      await playerStateRef.set({
        playerId,
        sessionId,
        playerName: session.players[playerId].name,
        cash: session.params.startingCash - totalCost,
        inventory: 0,
        marketDemand: session.params.startingDemand,
        suppliers,
        transit,
        roundHistory: [],
      });
    }

    // Transition to active
    const activeDisruptions: Record<string, ActiveDisruption | null> = { china: null, mexico: null, us: null };
    for (const country of ['china', 'mexico', 'us'] as const) {
      if (session.disruptionSchedule[country]?.includes(1)) {
        activeDisruptions[country] = {
          startRound: 1,
          endsAfterRound: 1 + session.params.disruptionDuration - 1,
        };
      }
    }

    await sessionRef.update({
      status: 'active',
      currentRound: 1,
      currentPhase: 'ordering',
      submittedPlayers: [],
      activeDisruptions,
    });

    return { success: true, action: 'setup_forced' };
  }

  if (session.status === 'active' && session.currentPhase === 'ordering') {
    // Submit zero orders for unsubmitted players
    const submitted = new Set(session.submittedPlayers || []);
    const allPlayerIds = Object.keys(session.players);
    const unsubmitted = allPlayerIds.filter(id => !submitted.has(id));

    for (const playerId of unsubmitted) {
      const zeroOrders: Record<string, number> = {};
      SUPPLIER_KEYS.forEach(key => { zeroOrders[key] = 0; });

      const orderRef = db.collection('sessions').doc(sessionId)
        .collection('rounds').doc(String(session.currentRound))
        .collection('orders').doc(playerId);

      await orderRef.set({ orders: zeroOrders, submittedAt: Date.now(), forced: true });
    }

    // Mark all as submitted and trigger processing
    await sessionRef.update({
      submittedPlayers: allPlayerIds,
      currentPhase: 'processing',
    });

    // Import and call processing
    const { processRound } = await import('./gameLogic');
    const playerStatesSnap = await db.collection('sessions').doc(sessionId)
      .collection('playerStates').get();

    const ordersSnap = await db.collection('sessions').doc(sessionId)
      .collection('rounds').doc(String(session.currentRound))
      .collection('orders').get();

    const ordersMap: Record<string, OrderMap> = {};
    ordersSnap.forEach(doc => { ordersMap[doc.id] = doc.data().orders; });

    const playerRoundData = playerStatesSnap.docs.map(doc => ({
      playerId: doc.id,
      orders: ordersMap[doc.id] || {},
      state: doc.data() as PlayerStateDoc,
    }));

    const result = processRound(
      session.currentRound,
      playerRoundData,
      session.params,
      session.disruptionSchedule,
      session.activeDisruptions,
    );

    const batch = db.batch();

    for (const [pid, state] of Object.entries(result.updatedStates)) {
      batch.update(
        db.collection('sessions').doc(sessionId).collection('playerStates').doc(pid),
        state,
      );
    }

    const nextRound = session.currentRound + 1;
    const nextDisruptions = { ...result.newActiveDisruptions };
    if (!result.gameCompleted) {
      for (const country of ['china', 'mexico', 'us'] as const) {
        if (nextDisruptions[country] && nextRound > nextDisruptions[country]!.endsAfterRound) {
          nextDisruptions[country] = null;
        }
        if (session.disruptionSchedule[country]?.includes(nextRound)) {
          nextDisruptions[country] = {
            startRound: nextRound,
            endsAfterRound: nextRound + session.params.disruptionDuration - 1,
          };
        }
      }
    }

    const update: Partial<SessionDoc> = {
      activeDisruptions: nextDisruptions,
      totalMarketDemand: result.newTotalMarketDemand,
    };

    if (result.gameCompleted) {
      update.status = 'completed';
      update.currentPhase = 'results';
    } else {
      update.currentRound = nextRound;
      update.currentPhase = 'ordering';
      update.submittedPlayers = [];
    }

    batch.update(sessionRef, update);
    await batch.commit();

    return { success: true, action: 'round_forced' };
  }

  throw new HttpsError('failed-precondition', 'Cannot force advance in current state');
});
