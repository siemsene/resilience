import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  SUPPLIER_KEYS,
  SUPPLIER_COUNTRY,
  SUPPLIER_RELIABLE,
  SupplierState,
  Country,
  SupplierKey,
  SessionDoc,
} from './types';
import { calculateUnitCost } from './gameLogic';
import { getInitialSupplierMaxOrder } from './orderLimits';
import { advanceResultsPhase, executeRoundProcessing } from './roundProcessing';
import { finalizeSetupPhase } from './setup';
import {
  sessionInstructorStateRef,
  sessionPlayerRef,
  sessionPlayersRef,
  sessionPublicStateRef,
  sessionRef,
} from './sessionState';


export const forceAdvance = onCall(async (request) => {
  const { sessionId } = request.data as { sessionId?: string };
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'Session ID is required');
  }

  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  if (session.instructorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the instructor can force advance');
  }

  const instructorStateSnap = await sessionInstructorStateRef(sessionId).get();
  const submittedPlayerIds = (instructorStateSnap.data()?.submittedPlayerIds || []) as string[];
  const submittedSet = new Set(submittedPlayerIds);
  const playersSnap = await sessionPlayersRef(sessionId).orderBy('joinedAt', 'asc').get();
  const allPlayerDocs = playersSnap.docs.map((doc) => doc.data());
  const allPlayerIds = allPlayerDocs.map((doc) => doc.playerId as string);
  const unsubmittedPlayerDocs = allPlayerDocs.filter((doc) => !submittedSet.has(doc.playerId));

  if (session.status === 'setup') {
    for (const player of unsubmittedPlayerDocs) {
      const perSupplier = Math.floor(session.params.startingDemand / SUPPLIER_KEYS.length);
      const remainder = session.params.startingDemand - (perSupplier * SUPPLIER_KEYS.length);
      const allocations = {} as Record<SupplierKey, number>;
      SUPPLIER_KEYS.forEach((key, index) => {
        allocations[key] = perSupplier + (index < remainder ? 1 : 0);
      });

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
          maxOrder: getInitialSupplierMaxOrder(amount, session.params),
          totalOrdered: amount * transitTurns,
          active: amount > 0,
        };

        for (let i = 0; i < transitTurns; i += 1) {
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

      const cashRemaining = session.params.startingCash - totalCost;
      await sessionRef(sessionId).collection('playerStates').doc(player.playerId).set({
        playerId: player.playerId,
        sessionId,
        playerName: player.playerName,
        cash: cashRemaining,
        inventory: 0,
        marketDemand: session.params.startingDemand,
        suppliers,
        transit,
        roundHistory: [],
      });
      await sessionPlayerRef(sessionId, player.playerId).set({
        currentCash: cashRemaining,
        currentInventory: 0,
        currentDemand: session.params.startingDemand,
      }, { merge: true });
    }

    await sessionRef(sessionId).update({
      submittedCount: allPlayerIds.length,
      currentPhase: 'processing',
    });
    await sessionPublicStateRef(sessionId).set({
      sessionId,
      submittedCount: allPlayerIds.length,
      currentPhase: 'processing',
    }, { merge: true });
    await sessionInstructorStateRef(sessionId).set({
      sessionId,
      submittedPlayerIds: allPlayerIds,
      updatedAt: Date.now(),
    }, { merge: true });

    await finalizeSetupPhase(sessionId);
    return { success: true, action: 'setup_forced' };
  }

  if (session.status === 'active' && session.currentPhase === 'ordering') {
    for (const player of unsubmittedPlayerDocs) {
      const zeroOrders: Record<string, number> = {};
      SUPPLIER_KEYS.forEach((key) => { zeroOrders[key] = 0; });
      await sessionRef(sessionId)
        .collection('rounds').doc(String(session.currentRound))
        .collection('orders').doc(player.playerId)
        .set({ orders: zeroOrders, submittedAt: Date.now(), forced: true });
      await sessionRef(sessionId).collection('playerStates').doc(player.playerId).set({
        lastSubmittedRound: session.currentRound,
      }, { merge: true });
    }

    await sessionRef(sessionId).update({
      submittedCount: allPlayerIds.length,
      currentPhase: 'processing',
    });
    await sessionPublicStateRef(sessionId).set({
      sessionId,
      submittedCount: allPlayerIds.length,
      currentPhase: 'processing',
    }, { merge: true });
    await sessionInstructorStateRef(sessionId).set({
      sessionId,
      submittedPlayerIds: allPlayerIds,
      updatedAt: Date.now(),
    }, { merge: true });

    await executeRoundProcessing(sessionId);
    return { success: true, action: 'round_forced' };
  }

  if (session.status === 'active' && session.currentPhase === 'results') {
    const advanced = await advanceResultsPhase(sessionId);
    if (!advanced) {
      throw new HttpsError('failed-precondition', 'Round results are no longer waiting for confirmation');
    }

    return { success: true, action: 'results_forced' };
  }

  throw new HttpsError('failed-precondition', 'Cannot force advance in current state');
});


