import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SessionDoc } from './types';

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

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  assertInstructor(session, uid);

  if (session.status === 'completed' || session.status === 'expired') {
    throw new HttpsError('failed-precondition', 'Session is already ended');
  }

  await sessionRef.update({
    status: 'completed',
    currentPhase: 'results',
    submittedPlayers: [],
    activeDisruptions: { china: null, mexico: null, us: null },
    endedEarlyAt: Date.now(),
  });

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

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  assertInstructor(session, uid);

  await db.recursiveDelete(sessionRef);
  return { success: true };
});
