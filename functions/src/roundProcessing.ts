import * as admin from 'firebase-admin';
import { processRound } from './gameLogic';
import { OrderMap, PlayerStateDoc, SessionDoc, SessionInstructorState } from './types';
import { sessionInstructorStateRef, sessionPlayerRef, sessionPublicStateRef, sessionRef } from './sessionState';

const db = admin.firestore();

export async function advanceResultsPhase(sessionId: string): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const [sessionSnap, instructorStateSnap] = await Promise.all([
      transaction.get(sessionRef(sessionId)),
      transaction.get(sessionInstructorStateRef(sessionId)),
    ]);

    if (!sessionSnap.exists) {
      throw new Error('Session not found');
    }

    const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
    if (session.status !== 'active' || session.currentPhase !== 'results') {
      return false;
    }

    const deleteField = admin.firestore.FieldValue.delete();
    transaction.update(sessionRef(sessionId), {
      currentPhase: 'ordering',
      resultsRound: deleteField,
      resultsConfirmedCount: deleteField,
    });
    transaction.set(sessionPublicStateRef(sessionId), {
      sessionId,
      currentPhase: 'ordering',
      resultsRound: deleteField,
      resultsConfirmedCount: deleteField,
    }, { merge: true });
    transaction.set(sessionInstructorStateRef(sessionId), {
      sessionId,
      updatedAt: Date.now(),
      resultsRound: deleteField,
      resultsConfirmedPlayerIds: deleteField,
      submittedPlayerIds: instructorStateSnap.data()?.submittedPlayerIds || [],
    }, { merge: true });

    return true;
  });
}

export async function executeRoundProcessing(sessionId: string) {
  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new Error('Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  const round = session.currentRound;

  const [playerStatesSnap, ordersSnap, instructorStateSnap] = await Promise.all([
    sessionRef(sessionId).collection('playerStates').get(),
    sessionRef(sessionId).collection('rounds').doc(String(round)).collection('orders').get(),
    sessionInstructorStateRef(sessionId).get(),
  ]);

  const ordersMap: Record<string, OrderMap> = {};
  ordersSnap.forEach((doc) => {
    ordersMap[doc.id] = doc.data().orders;
  });

  const playerRoundData = playerStatesSnap.docs.map((doc) => ({
    playerId: doc.id,
    orders: ordersMap[doc.id] || {},
    state: { ...(doc.data() as PlayerStateDoc) },
  }));

  const instructorState = instructorStateSnap.exists
    ? (instructorStateSnap.data() as SessionInstructorState)
    : null;

  const {
    updatedStates,
    newActiveDisruptions,
    newTotalMarketDemand,
    gameCompleted,
    newSupplierCapacities,
  } = processRound(
    round,
    playerRoundData,
    session.params,
    session.disruptionSchedule,
    session.activeDisruptions,
    instructorState?.supplierCapacities,
  );

  const batch = db.batch();
  for (const [pid, state] of Object.entries(updatedStates)) {
    const playerStateDocRef = sessionRef(sessionId).collection('playerStates').doc(pid);
    batch.update(playerStateDocRef, state);
    batch.set(sessionPlayerRef(sessionId, pid), {
      currentCash: state.cash,
      currentInventory: state.inventory,
      currentDemand: state.marketDemand,
    }, { merge: true });
  }

  const nextRound = round + 1;
  const nextActiveDisruptions = { ...newActiveDisruptions };
  if (!gameCompleted) {
    for (const country of ['china', 'mexico', 'us'] as const) {
      if (nextActiveDisruptions[country] && nextRound > nextActiveDisruptions[country]!.endsAfterRound) {
        nextActiveDisruptions[country] = null;
      }
      if (session.disruptionSchedule[country]?.includes(nextRound)) {
        nextActiveDisruptions[country] = {
          startRound: nextRound,
          endsAfterRound: nextRound + session.params.disruptionDuration - 1,
        };
      }
    }
  }

  const summaryUpdate: Partial<SessionDoc> = {
    activeDisruptions: nextActiveDisruptions,
    totalMarketDemand: newTotalMarketDemand,
    submittedCount: 0,
  };
  const deleteField = admin.firestore.FieldValue.delete();

  if (gameCompleted) {
    summaryUpdate.status = 'completed';
    summaryUpdate.currentPhase = 'results';
  } else {
    summaryUpdate.currentRound = nextRound;
    summaryUpdate.currentPhase = 'results';
    summaryUpdate.resultsRound = round;
    summaryUpdate.resultsConfirmedCount = 0;
  }

  const sessionSummaryUpdate = gameCompleted
    ? {
        activeDisruptions: nextActiveDisruptions,
        totalMarketDemand: newTotalMarketDemand,
        submittedCount: 0,
        status: 'completed' as const,
        currentPhase: 'results' as const,
        resultsRound: deleteField,
        resultsConfirmedCount: deleteField,
      }
    : {
        activeDisruptions: nextActiveDisruptions,
        totalMarketDemand: newTotalMarketDemand,
        submittedCount: 0,
        currentRound: nextRound,
        currentPhase: 'results' as const,
        resultsRound: round,
        resultsConfirmedCount: 0,
      };

  batch.update(sessionRef(sessionId), sessionSummaryUpdate);
  batch.set(sessionPublicStateRef(sessionId), {
    sessionId,
    status: summaryUpdate.status ?? session.status,
    currentRound: summaryUpdate.currentRound ?? session.currentRound,
    currentPhase: summaryUpdate.currentPhase ?? session.currentPhase,
    activeDisruptions: nextActiveDisruptions,
    submittedCount: 0,
    playerCount: session.playerCount,
    totalMarketDemand: newTotalMarketDemand,
    ...(gameCompleted
      ? {
          resultsRound: deleteField,
          resultsConfirmedCount: deleteField,
        }
      : {
          resultsRound: round,
          resultsConfirmedCount: 0,
        }),
  }, { merge: true });
  batch.set(sessionInstructorStateRef(sessionId), {
    sessionId,
    submittedPlayerIds: [],
    supplierCapacities: newSupplierCapacities,
    ...(gameCompleted
      ? {
          resultsRound: deleteField,
          resultsConfirmedPlayerIds: deleteField,
        }
      : {
          resultsRound: round,
          resultsConfirmedPlayerIds: [],
        }),
    updatedAt: Date.now(),
  }, { merge: true });
  await batch.commit();
}
