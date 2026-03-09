import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const startGame = onCall(async (request) => {
  const { sessionId } = request.data;
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'Session ID is required');
  }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data()!;

  if (session.instructorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the session instructor can start the game');
  }

  if (session.status !== 'lobby') {
    throw new HttpsError('failed-precondition', 'Game can only be started from lobby');
  }

  const players = session.players || {};
  const playerCount = Object.keys(players).length;

  if (playerCount < 1) {
    throw new HttpsError('failed-precondition', 'At least 1 player is required to start');
  }

  const totalMarketDemand = playerCount * session.params.startingDemand;

  await sessionRef.update({
    status: 'setup',
    currentRound: 0,
    currentPhase: 'ordering',
    submittedPlayers: [],
    totalMarketDemand,
  });

  return { success: true };
});
