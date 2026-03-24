import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  SUPPLIER_KEYS,
  SUPPLIER_COUNTRY,
  SUPPLIER_RELIABLE,
  OrderMap,
  SessionDoc,
  SupplierState,
  ActiveDisruption,
  PlayerStateDoc,
  SupplierKey,
  Country,
} from './types';
import { calculateUnitCost } from './gameLogic';
import { getInitialSupplierMaxOrder } from './orderLimits';
import {
  buildInitialSupplierCapacities,
  getSetupOrderTotalsFromPlayerStates,
} from './supplierCapacity';
import {
  sessionInstructorStateRef,
  sessionPlayerRef,
  sessionPublicStateRef,
  sessionRef,
} from './sessionState';

const db = admin.firestore();

export async function finalizeSetupPhase(sessionId: string) {
  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  const playerStatesSnap = await sessionRef(sessionId).collection('playerStates').get();
  const playerStates = playerStatesSnap.docs.map((doc) => doc.data() as PlayerStateDoc);
  const setupOrderTotals = getSetupOrderTotalsFromPlayerStates(playerStates);

  const activeDisruptions: Record<Country, ActiveDisruption | null> = {
    china: null,
    mexico: null,
    us: null,
  };
  for (const country of ['china', 'mexico', 'us'] as const) {
    if (session.disruptionSchedule[country]?.includes(1)) {
      activeDisruptions[country] = {
        startRound: 1,
        endsAfterRound: 1 + session.params.disruptionDuration - 1,
      };
    }
  }

  const supplierCapacities = buildInitialSupplierCapacities(
    setupOrderTotals,
    session.playerCount,
    session.params,
    1,
  );

  const hasRound1Disruption = (['china', 'mexico', 'us'] as const).some(
    c => session.disruptionSchedule[c]?.includes(1),
  );
  const timerBonus = hasRound1Disruption ? (session.params.disruptionBonusTime ?? 60) : 0;
  const roundDeadline = Date.now() + ((session.params.roundTimeLimit ?? 120) + timerBonus) * 1000;

  const batch = db.batch();
  const deleteField = admin.firestore.FieldValue.delete();
  batch.update(sessionRef(sessionId), {
    status: 'active',
    currentRound: 1,
    currentPhase: 'ordering',
    submittedCount: 0,
    activeDisruptions,
    resultsRound: deleteField,
    resultsConfirmedCount: deleteField,
    roundDeadline,
  });
  batch.set(sessionPublicStateRef(sessionId), {
    sessionId,
    status: 'active',
    currentRound: 1,
    currentPhase: 'ordering',
    submittedCount: 0,
    playerCount: session.playerCount,
    totalMarketDemand: session.totalMarketDemand,
    activeDisruptions,
    resultsRound: deleteField,
    resultsConfirmedCount: deleteField,
    roundDeadline,
  }, { merge: true });
  batch.set(sessionInstructorStateRef(sessionId), {
    sessionId,
    submittedPlayerIds: [],
    supplierCapacities,
    resultsRound: deleteField,
    resultsConfirmedPlayerIds: deleteField,
    updatedAt: Date.now(),
  }, { merge: true });
  await batch.commit();
}

export const submitInitialSetup = onCall(async (request) => {
  const { sessionId, playerId, allocations } = request.data as {
    sessionId?: string;
    playerId?: string;
    allocations?: OrderMap;
  };

  if (!sessionId || !playerId || !allocations) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  if (session.status !== 'setup') {
    throw new HttpsError('failed-precondition', 'Game is not in setup phase');
  }

  const allocationMap = allocations as OrderMap;
  let total = 0;
  for (const key of SUPPLIER_KEYS) {
    const val = allocationMap[key] || 0;
    if (val < 0 || !Number.isInteger(val)) {
      throw new HttpsError('invalid-argument', `Invalid allocation for ${key}`);
    }
    total += val;
  }

  if (total !== session.params.startingDemand) {
    throw new HttpsError('invalid-argument', `Allocations must sum to ${session.params.startingDemand}. Got ${total}`);
  }

  const playerSnap = await sessionPlayerRef(sessionId, playerId).get();
  if (!playerSnap.exists) {
    throw new HttpsError('not-found', 'Player not found in session');
  }
  const playerDoc = playerSnap.data();

  const transit: Record<Country, number[]> = {
    china: new Array(session.params.transitTurns.china).fill(0),
    mexico: new Array(session.params.transitTurns.mexico).fill(0),
    us: new Array(session.params.transitTurns.us).fill(0),
  };

  const suppliers = {} as Record<SupplierKey, SupplierState>;
  let totalCost = 0;

  for (const key of SUPPLIER_KEYS) {
    const amount = allocationMap[key] || 0;
    const country = SUPPLIER_COUNTRY[key];
    const isUnreliable = !SUPPLIER_RELIABLE[key];
    const transitTurns = session.params.transitTurns[country];

      suppliers[key] = {
        lastOrder: amount,
        maxOrder: getInitialSupplierMaxOrder(amount, session.params),
        totalOrdered: amount * transitTurns,
        active: amount > 0,
      };

    if (amount > 0) {
      for (let i = 0; i < transitTurns; i += 1) {
        transit[country][i] += amount;
      }

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
  let shouldFinalize = false;

  await db.runTransaction(async (transaction) => {
    const freshSessionSnap = await transaction.get(sessionRef(sessionId));
    const instructorStateSnap = await transaction.get(sessionInstructorStateRef(sessionId));
    const playerStateRef = sessionRef(sessionId).collection('playerStates').doc(playerId);
    const existingPlayerStateSnap = await transaction.get(playerStateRef);

    if (!freshSessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const freshSession = { id: freshSessionSnap.id, ...freshSessionSnap.data() } as SessionDoc;
    if (freshSession.status !== 'setup') {
      throw new HttpsError('failed-precondition', 'Game is not in setup phase');
    }
    if (existingPlayerStateSnap.exists) {
      throw new HttpsError('already-exists', 'You have already submitted your setup');
    }

    const submittedPlayerIds = (instructorStateSnap.data()?.submittedPlayerIds || []) as string[];
    if (submittedPlayerIds.includes(playerId)) {
      throw new HttpsError('already-exists', 'You have already submitted your setup');
    }

    transaction.set(playerStateRef, {
      playerId,
      sessionId,
      playerName: playerDoc?.playerName,
      cash: cashRemaining,
      inventory: 0,
      marketDemand: session.params.startingDemand,
      suppliers,
      transit,
      roundHistory: [],
    });
    transaction.set(sessionPlayerRef(sessionId, playerId), {
      currentCash: cashRemaining,
      currentInventory: 0,
      currentDemand: session.params.startingDemand,
    }, { merge: true });

    const nextSubmittedPlayerIds = [...submittedPlayerIds, playerId];
    shouldFinalize = nextSubmittedPlayerIds.length >= freshSession.playerCount;

    if (shouldFinalize) {
      transaction.update(sessionRef(sessionId), {
        currentPhase: 'processing',
        submittedCount: nextSubmittedPlayerIds.length,
      });
      transaction.set(sessionPublicStateRef(sessionId), {
        sessionId,
        currentPhase: 'processing',
        submittedCount: nextSubmittedPlayerIds.length,
      }, { merge: true });
    } else {
      transaction.update(sessionRef(sessionId), {
        submittedCount: nextSubmittedPlayerIds.length,
      });
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
  });

  if (shouldFinalize) {
    await finalizeSetupPhase(sessionId);
  }

  return { success: true, cashRemaining };
});
