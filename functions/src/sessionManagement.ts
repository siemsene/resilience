import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { advanceResultsPhase, executeRoundProcessing } from './roundProcessing';
import { finalizeSetupPhase } from './setup';
import type { SessionDoc, SessionMemberDoc, SessionPlayerDoc } from './types';
import {
  buildEmptyDisruptions,
  sessionInstructorStateRef,
  sessionMemberRef,
  sessionPlayerNameRef,
  sessionPlayerRef,
  sessionPublicStateRef,
  sessionRef,
} from './sessionState';

const db = admin.firestore();

function assertInstructor(session: SessionDoc, uid: string) {
  if (session.instructorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the session instructor can perform this action');
  }
}

export const endSessionEarly = onCall(async (request) => {
  const { sessionId } = request.data as { sessionId?: string };
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Session ID is required');
  }

  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  assertInstructor(session, uid);

  if (session.status === 'completed' || session.status === 'expired') {
    throw new HttpsError('failed-precondition', 'Session is already ended');
  }

  const activeDisruptions = buildEmptyDisruptions();
  const batch = db.batch();
  batch.update(sessionRef(sessionId), {
    status: 'completed',
    currentPhase: 'results',
    submittedCount: 0,
    activeDisruptions,
    endedEarlyAt: Date.now(),
  });
  batch.set(sessionPublicStateRef(sessionId), {
    sessionId,
    status: 'completed',
    currentPhase: 'results',
    submittedCount: 0,
    activeDisruptions,
  }, { merge: true });
  batch.set(sessionInstructorStateRef(sessionId), {
    sessionId,
    submittedPlayerIds: [],
    updatedAt: Date.now(),
  }, { merge: true });
  await batch.commit();

  return { success: true };
});

export const deleteSession = onCall(async (request) => {
  const { sessionId } = request.data as { sessionId?: string };
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Session ID is required');
  }

  const sessionSnap = await sessionRef(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  assertInstructor(session, uid);

  await db.recursiveDelete(sessionRef(sessionId));
  return { success: true };
});

async function cleanupPlayerRoundOrders(sessionId: string, playerId: string) {
  const roundsSnap = await sessionRef(sessionId).collection('rounds').get();
  if (roundsSnap.empty) {
    return;
  }

  const batch = db.batch();
  roundsSnap.docs.forEach((roundDoc) => {
    batch.delete(roundDoc.ref.collection('orders').doc(playerId));
  });
  await batch.commit();
}

export const removePlayer = onCall(async (request) => {
  const { sessionId, playerId } = request.data as { sessionId?: string; playerId?: string };
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Session ID is required');
  }
  if (!playerId || typeof playerId !== 'string') {
    throw new HttpsError('invalid-argument', 'Player ID is required');
  }

  const deleteField = admin.firestore.FieldValue.delete();
  let shouldFinalizeSetup = false;
  let shouldProcessRound = false;
  let shouldAdvanceResults = false;
  let removedPlayerName = '';

  await db.runTransaction(async (transaction) => {
    const sessionDocRef = sessionRef(sessionId);
    const playerDocRef = sessionPlayerRef(sessionId, playerId);
    const playerStateDocRef = sessionDocRef.collection('playerStates').doc(playerId);

    const [sessionSnap, instructorStateSnap, playerSnap, playerStateSnap] = await Promise.all([
      transaction.get(sessionDocRef),
      transaction.get(sessionInstructorStateRef(sessionId)),
      transaction.get(playerDocRef),
      transaction.get(playerStateDocRef),
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }
    if (!playerSnap.exists) {
      throw new HttpsError('not-found', 'Player not found');
    }

    const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
    assertInstructor(session, uid);

    if (session.status === 'completed' || session.status === 'expired') {
      throw new HttpsError('failed-precondition', 'Player removal is not available for ended sessions');
    }

    const player = playerSnap.data() as SessionPlayerDoc;
    removedPlayerName = player.playerName;
    const instructorState = instructorStateSnap.data() as {
      submittedPlayerIds?: string[];
      resultsConfirmedPlayerIds?: string[];
    } | undefined;
    const submittedPlayerIds = (instructorState?.submittedPlayerIds || []).filter((id) => id !== playerId);
    const resultsConfirmedPlayerIds = (instructorState?.resultsConfirmedPlayerIds || []).filter((id) => id !== playerId);
    const nextPlayerCount = Math.max(0, session.playerCount - 1);

    let nextTotalMarketDemand = 0;
    if (session.status === 'setup') {
      nextTotalMarketDemand = nextPlayerCount * session.params.startingDemand;
    } else if (session.status === 'active' && nextPlayerCount > 0) {
      const remainingPlayerStatesSnap = await transaction.get(sessionDocRef.collection('playerStates'));
      nextTotalMarketDemand = remainingPlayerStatesSnap.docs.reduce((sum, docSnap) => {
        if (docSnap.id === playerId) {
          return sum;
        }
        return sum + (((docSnap.data() as { marketDemand?: number }).marketDemand) || 0);
      }, 0);
    }

    const nextSubmittedCount = submittedPlayerIds.length;
    const nextResultsConfirmedCount = resultsConfirmedPlayerIds.length;
    const sessionUpdate: Record<string, unknown> = {
      playerCount: nextPlayerCount,
      submittedCount: nextSubmittedCount,
      totalMarketDemand: nextTotalMarketDemand,
    };
    const publicStateUpdate: Record<string, unknown> = {
      sessionId,
      playerCount: nextPlayerCount,
      submittedCount: nextSubmittedCount,
      totalMarketDemand: nextTotalMarketDemand,
    };
    const instructorStateUpdate: Record<string, unknown> = {
      sessionId,
      submittedPlayerIds,
      updatedAt: Date.now(),
    };

    if (session.currentPhase === 'results' || session.resultsConfirmedCount != null) {
      sessionUpdate.resultsConfirmedCount = nextResultsConfirmedCount;
      publicStateUpdate.resultsConfirmedCount = nextResultsConfirmedCount;
      instructorStateUpdate.resultsConfirmedPlayerIds = resultsConfirmedPlayerIds;
      if (session.resultsRound != null) {
        publicStateUpdate.resultsRound = session.resultsRound;
        instructorStateUpdate.resultsRound = session.resultsRound;
      }
    }

    if (nextPlayerCount === 0 && session.status !== 'lobby') {
      const activeDisruptions = buildEmptyDisruptions();
      sessionUpdate.status = 'completed';
      sessionUpdate.currentPhase = 'results';
      sessionUpdate.submittedCount = 0;
      sessionUpdate.totalMarketDemand = 0;
      sessionUpdate.activeDisruptions = activeDisruptions;
      sessionUpdate.resultsRound = deleteField;
      sessionUpdate.resultsConfirmedCount = deleteField;

      publicStateUpdate.status = 'completed';
      publicStateUpdate.currentPhase = 'results';
      publicStateUpdate.submittedCount = 0;
      publicStateUpdate.totalMarketDemand = 0;
      publicStateUpdate.activeDisruptions = activeDisruptions;
      publicStateUpdate.resultsRound = deleteField;
      publicStateUpdate.resultsConfirmedCount = deleteField;

      instructorStateUpdate.submittedPlayerIds = [];
      instructorStateUpdate.resultsRound = deleteField;
      instructorStateUpdate.resultsConfirmedPlayerIds = deleteField;
    } else if (session.status === 'setup' && nextPlayerCount > 0 && nextSubmittedCount >= nextPlayerCount) {
      shouldFinalizeSetup = true;
      sessionUpdate.currentPhase = 'processing';
      sessionUpdate.submittedCount = nextPlayerCount;
      publicStateUpdate.currentPhase = 'processing';
      publicStateUpdate.submittedCount = nextPlayerCount;
      instructorStateUpdate.submittedPlayerIds = submittedPlayerIds;
    } else if (session.status === 'active' && session.currentPhase === 'ordering' && nextPlayerCount > 0 && nextSubmittedCount >= nextPlayerCount) {
      shouldProcessRound = true;
      sessionUpdate.currentPhase = 'processing';
      sessionUpdate.submittedCount = nextPlayerCount;
      publicStateUpdate.currentPhase = 'processing';
      publicStateUpdate.submittedCount = nextPlayerCount;
      instructorStateUpdate.submittedPlayerIds = submittedPlayerIds;
    } else if (session.status === 'active' && session.currentPhase === 'results' && nextPlayerCount > 0 && nextResultsConfirmedCount >= nextPlayerCount) {
      shouldAdvanceResults = true;
    }

    transaction.update(sessionDocRef, sessionUpdate);
    transaction.set(sessionPublicStateRef(sessionId), publicStateUpdate, { merge: true });
    transaction.set(sessionInstructorStateRef(sessionId), instructorStateUpdate, { merge: true });
    transaction.delete(playerDocRef);
    transaction.delete(sessionPlayerNameRef(sessionId, player.nameKey));
    if (playerStateSnap.exists) {
      transaction.delete(playerStateDocRef);
    }

    const memberDoc: SessionMemberDoc = {
      playerId,
      playerName: player.playerName,
      removedAt: Date.now(),
      removedByInstructor: true,
      removedPlayerId: playerId,
      removedPlayerName: player.playerName,
    };
    transaction.set(sessionMemberRef(sessionId, player.authUid), memberDoc);
  });

  await cleanupPlayerRoundOrders(sessionId, playerId);

  if (shouldFinalizeSetup) {
    await finalizeSetupPhase(sessionId);
  } else if (shouldProcessRound) {
    await executeRoundProcessing(sessionId);
  } else if (shouldAdvanceResults) {
    await advanceResultsPhase(sessionId);
  }

  return {
    success: true,
    playerId,
    playerName: removedPlayerName,
    action: shouldFinalizeSetup
      ? 'setup_advanced'
      : shouldProcessRound
        ? 'round_processed'
        : shouldAdvanceResults
          ? 'results_advanced'
          : 'player_removed',
  };
});
