import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, OrderMap, PlayerStateDoc, SessionDoc } from './types';
import { getCurrentSupplierMaxOrder } from './orderLimits';
import { executeRoundProcessing } from './roundProcessing';
import { sessionInstructorStateRef, sessionPlayerRef, sessionPublicStateRef, sessionRef } from './sessionState';

const db = admin.firestore();

export const submitOrders = onCall(async (request) => {
  const { sessionId, playerId, orders } = request.data as {
    sessionId?: string;
    playerId?: string;
    orders?: OrderMap;
  };

  if (!sessionId || !playerId || !orders) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const sessionDocRef = sessionRef(sessionId);
  const sessionSnap = await sessionDocRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  if (session.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Game is not active');
  }

  const playerRosterSnap = await sessionPlayerRef(sessionId, playerId).get();
  if (!playerRosterSnap.exists) {
    throw new HttpsError('not-found', 'Player not found');
  }

  const playerStateRef = sessionDocRef.collection('playerStates').doc(playerId);
  const playerStateSnap = await playerStateRef.get();
  if (!playerStateSnap.exists) {
    throw new HttpsError('not-found', 'Player state not found');
  }

  const playerState = playerStateSnap.data() as PlayerStateDoc;
  const canOrderInResultsPhase = session.currentPhase === 'results'
    && session.resultsRound != null
    && playerState.lastConfirmedResultsRound === session.resultsRound;
  if (session.currentPhase !== 'ordering' && !canOrderInResultsPhase) {
    throw new HttpsError('failed-precondition', 'Not in ordering phase');
  }

  const orderMap = orders as OrderMap;
  const minimumOrder = session.params.minimumOrder ?? 100;

  for (const key of SUPPLIER_KEYS) {
    const val = orderMap[key] || 0;
    if (val < 0 || !Number.isInteger(val)) {
      throw new HttpsError('invalid-argument', `Invalid order for ${key}`);
    }

    if (val > 0 && val < minimumOrder) {
      throw new HttpsError('invalid-argument', `Order for ${key} must be at least ${minimumOrder} units or 0`);
    }

    const country = SUPPLIER_COUNTRY[key];
    if (session.activeDisruptions[country] && val > 0) {
      throw new HttpsError('invalid-argument', `Cannot order from ${country} — supply disrupted`);
    }

    const supplierState = playerState.suppliers?.[key];
    const maxOrder = getCurrentSupplierMaxOrder(supplierState, session.params);
    if (val > maxOrder) {
      throw new HttpsError('invalid-argument', supplierState?.active
        ? `Order for ${key} exceeds max (${maxOrder}). Last order: ${supplierState.lastOrder}`
        : `New supplier ${key} limited to ${maxOrder} units`);
    }
  }

  let shouldProcessRound = false;

  const result = await db.runTransaction(async (transaction) => {
    const freshSessionSnap = await transaction.get(sessionDocRef);
    const instructorStateSnap = await transaction.get(sessionInstructorStateRef(sessionId));
    const freshPlayerStateSnap = await transaction.get(playerStateRef);

    if (!freshSessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }
    if (!freshPlayerStateSnap.exists) {
      throw new HttpsError('not-found', 'Player state not found');
    }

    const freshSession = { id: freshSessionSnap.id, ...freshSessionSnap.data() } as SessionDoc;
    const freshPlayerState = freshPlayerStateSnap.data() as PlayerStateDoc;
    if (freshSession.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Game is not active');
    }
    const freshCanOrderInResults = freshSession.currentPhase === 'results'
      && freshSession.resultsRound != null
      && freshPlayerState.lastConfirmedResultsRound === freshSession.resultsRound;
    if (freshSession.currentPhase !== 'ordering' && !freshCanOrderInResults) {
      throw new HttpsError('failed-precondition', 'Not in ordering phase');
    }
    if (freshPlayerState.lastSubmittedRound === freshSession.currentRound) {
      throw new HttpsError('already-exists', 'Orders already submitted for this round');
    }

    const submittedPlayerIds = (instructorStateSnap.data()?.submittedPlayerIds || []) as string[];
    if (submittedPlayerIds.includes(playerId)) {
      throw new HttpsError('already-exists', 'Orders already submitted for this round');
    }

    const orderRef = sessionDocRef.collection('rounds').doc(String(freshSession.currentRound)).collection('orders').doc(playerId);
    transaction.set(orderRef, { orders: orderMap, submittedAt: Date.now() });
    transaction.set(playerStateRef, { lastSubmittedRound: freshSession.currentRound }, { merge: true });

    const nextSubmittedPlayerIds = [...submittedPlayerIds, playerId];
    shouldProcessRound = nextSubmittedPlayerIds.length >= freshSession.playerCount;

    if (shouldProcessRound) {
      transaction.update(sessionDocRef, {
        submittedCount: nextSubmittedPlayerIds.length,
        currentPhase: 'processing',
      });
      transaction.set(sessionPublicStateRef(sessionId), {
        sessionId,
        submittedCount: nextSubmittedPlayerIds.length,
        currentPhase: 'processing',
      }, { merge: true });
    } else {
      transaction.update(sessionDocRef, { submittedCount: nextSubmittedPlayerIds.length });
      transaction.set(sessionPublicStateRef(sessionId), {
        sessionId,
        submittedCount: nextSubmittedPlayerIds.length,
      }, { merge: true });
    }

    transaction.set(sessionInstructorStateRef(sessionId), {
      sessionId,
      submittedPlayerIds: nextSubmittedPlayerIds,
      updatedAt: Date.now(),
    }, { merge: true });

    return { success: true, roundProcessed: shouldProcessRound };
  });

  if (!shouldProcessRound) {
    const freshSnap = await sessionDocRef.get();
    const freshSession = { id: freshSnap.id, ...freshSnap.data() } as SessionDoc;
    const deadline = freshSession.roundDeadline ?? 0;
    if (deadline > 0 && Date.now() >= deadline) {
      shouldProcessRound = await autoSubmitRemainingPlayers(sessionId, freshSession.currentRound);
    }
  }

  if (shouldProcessRound) {
    await executeRoundProcessing(sessionId);
  }

  return result;
});

async function autoSubmitRemainingPlayers(sessionId: string, round: number): Promise<boolean> {
  const sessionDocRef = sessionRef(sessionId);

  return db.runTransaction(async (transaction) => {
    const [sessionSnap, instructorStateSnap] = await Promise.all([
      transaction.get(sessionDocRef),
      transaction.get(sessionInstructorStateRef(sessionId)),
    ]);

    if (!sessionSnap.exists) return false;

    const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
    if (session.currentPhase === 'processing' || session.currentRound !== round) {
      return false;
    }

    const submittedIds = new Set((instructorStateSnap.data()?.submittedPlayerIds || []) as string[]);
    const playerStatesSnap = await transaction.get(
      sessionDocRef.collection('playerStates'),
    );

    const unsubmitted: { playerId: string; state: PlayerStateDoc }[] = [];
    for (const doc of playerStatesSnap.docs) {
      if (!submittedIds.has(doc.id)) {
        unsubmitted.push({ playerId: doc.id, state: doc.data() as PlayerStateDoc });
      }
    }

    if (unsubmitted.length === 0) return false;

    const allSubmittedIds = [...submittedIds];
    for (const { playerId, state } of unsubmitted) {
      const orders: Record<string, number> = {};
      for (const key of SUPPLIER_KEYS) {
        const country = SUPPLIER_COUNTRY[key];
        if (session.activeDisruptions[country]) {
          orders[key] = 0;
        } else {
          orders[key] = state.suppliers?.[key]?.lastOrder ?? 0;
        }
      }

      const orderRef = sessionDocRef
        .collection('rounds').doc(String(round))
        .collection('orders').doc(playerId);
      transaction.set(orderRef, { orders, submittedAt: Date.now(), autoSubmitted: true });

      const playerStateRef = sessionDocRef.collection('playerStates').doc(playerId);
      transaction.set(playerStateRef, { lastSubmittedRound: round }, { merge: true });

      allSubmittedIds.push(playerId);
    }

    transaction.update(sessionDocRef, {
      submittedCount: allSubmittedIds.length,
      currentPhase: 'processing',
    });
    transaction.set(sessionPublicStateRef(sessionId), {
      sessionId,
      submittedCount: allSubmittedIds.length,
      currentPhase: 'processing',
    }, { merge: true });
    transaction.set(sessionInstructorStateRef(sessionId), {
      sessionId,
      submittedPlayerIds: allSubmittedIds,
      updatedAt: Date.now(),
    }, { merge: true });

    return true;
  });
}
