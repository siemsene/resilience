import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SessionDoc } from './types';
import { sessionInstructorStateRef, sessionPlayersRef, sessionPublicStateRef, sessionRef } from './sessionState';

const db = admin.firestore();

export const startGame = onCall(async (request) => {
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
    throw new HttpsError('permission-denied', 'Only the session instructor can start the game');
  }
  if (session.status !== 'lobby') {
    throw new HttpsError('failed-precondition', 'Game can only be started from lobby');
  }

  const playersSnap = await sessionPlayersRef(sessionId).get();
  const playerCount = playersSnap.size;
  if (playerCount < 1) {
    throw new HttpsError('failed-precondition', 'At least 1 player is required to start');
  }

  const totalMarketDemand = playerCount * session.params.startingDemand;
  const nextState = {
    status: 'setup' as const,
    currentRound: 0,
    currentPhase: 'ordering' as const,
    submittedCount: 0,
    playerCount,
    totalMarketDemand,
  };

  const batch = db.batch();
  const deleteField = admin.firestore.FieldValue.delete();
  batch.update(sessionRef(sessionId), nextState);
  batch.set(sessionPublicStateRef(sessionId), {
    sessionId,
    ...nextState,
    activeDisruptions: session.activeDisruptions,
    resultsRound: deleteField,
    resultsConfirmedCount: deleteField,
  }, { merge: true });
  batch.set(sessionInstructorStateRef(sessionId), {
    sessionId,
    submittedPlayerIds: [],
    resultsRound: deleteField,
    resultsConfirmedPlayerIds: deleteField,
    updatedAt: Date.now(),
  }, { merge: true });
  await batch.commit();

  return { success: true };
});
