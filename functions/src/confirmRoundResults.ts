import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { advanceResultsPhase } from './roundProcessing';
import { PlayerStateDoc, SessionDoc, SessionInstructorState } from './types';
import { sessionInstructorStateRef, sessionPlayerRef, sessionPublicStateRef, sessionRef } from './sessionState';

const db = admin.firestore();

export const confirmRoundResults = onCall(async (request) => {
  const { sessionId, playerId } = request.data as {
    sessionId?: string;
    playerId?: string;
  };

  if (!sessionId || !playerId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const sessionDocRef = sessionRef(sessionId);
  const playerStateRef = sessionDocRef.collection('playerStates').doc(playerId);
  let shouldAdvance = false;

  const result = await db.runTransaction(async (transaction) => {
    const [sessionSnap, instructorStateSnap, playerRosterSnap, playerStateSnap] = await Promise.all([
      transaction.get(sessionDocRef),
      transaction.get(sessionInstructorStateRef(sessionId)),
      transaction.get(sessionPlayerRef(sessionId, playerId)),
      transaction.get(playerStateRef),
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }
    if (!playerRosterSnap.exists || !playerStateSnap.exists) {
      throw new HttpsError('not-found', 'Player not found');
    }

    const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
    const instructorState = instructorStateSnap.exists
      ? (instructorStateSnap.data() as SessionInstructorState)
      : null;
    const playerState = playerStateSnap.data() as PlayerStateDoc;
    const resultsRound = session.resultsRound;

    if (session.status !== 'active' || session.currentPhase !== 'results' || resultsRound == null) {
      throw new HttpsError('failed-precondition', 'Round results are not awaiting confirmation');
    }

    if ((playerState.roundHistory[playerState.roundHistory.length - 1]?.round || 0) !== resultsRound) {
      throw new HttpsError('failed-precondition', 'Latest round results are not available yet');
    }

    if (playerState.lastConfirmedResultsRound === resultsRound) {
      return { success: true, alreadyConfirmed: true, roundAdvanced: false };
    }

    const confirmedPlayerIds = Array.from(new Set([
      ...(instructorState?.resultsConfirmedPlayerIds || []),
      playerId,
    ]));
    shouldAdvance = confirmedPlayerIds.length >= session.playerCount;

    transaction.set(playerStateRef, {
      lastConfirmedResultsRound: resultsRound,
    }, { merge: true });
    transaction.update(sessionDocRef, {
      resultsConfirmedCount: confirmedPlayerIds.length,
    });
    transaction.set(sessionPublicStateRef(sessionId), {
      sessionId,
      resultsRound,
      resultsConfirmedCount: confirmedPlayerIds.length,
    }, { merge: true });
    transaction.set(sessionInstructorStateRef(sessionId), {
      sessionId,
      resultsRound,
      resultsConfirmedPlayerIds: confirmedPlayerIds,
      updatedAt: Date.now(),
    }, { merge: true });

    return { success: true, alreadyConfirmed: false, roundAdvanced: false };
  });

  if (shouldAdvance) {
    const advanced = await advanceResultsPhase(sessionId);
    return {
      ...result,
      roundAdvanced: advanced,
    };
  }

  return result;
});
