import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SessionDoc } from './types';
import { buildEmptyDisruptions, sessionInstructorStateRef, sessionPublicStateRef, sessionRef } from './sessionState';

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
