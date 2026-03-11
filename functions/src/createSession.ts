import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { DisruptionSchedule, SessionDoc, SessionParams } from './types';
import {
  buildEmptyDisruptions,
  sessionInstructorStateRef,
  sessionPublicStateRef,
  sessionRef,
  toSessionInstructorState,
  toSessionPublicState,
} from './sessionState';

const db = admin.firestore();
const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomSessionCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueSessionCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomSessionCode();
    const existing = await db.collection('sessions').where('sessionCode', '==', code).limit(1).get();
    if (existing.empty) {
      return code;
    }
  }

  throw new HttpsError('resource-exhausted', 'Unable to allocate a unique session code');
}

export const createSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  const role = (request.auth?.token as { role?: string } | undefined)?.role;
  const { sessionName, params, disruptionSchedule } = request.data as {
    sessionName?: string;
    params?: SessionParams;
    disruptionSchedule?: DisruptionSchedule;
  };

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (role !== 'instructor') {
    const instructorSnap = await db.collection('instructors').doc(uid).get();
    const instructorStatus = instructorSnap.exists
      ? (instructorSnap.data() as { status?: string }).status
      : null;

    if (instructorStatus !== 'approved') {
      throw new HttpsError('permission-denied', 'Instructor access required');
    }
  }
  if (!sessionName || typeof sessionName !== 'string' || sessionName.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Session name is required');
  }
  if (!params || !disruptionSchedule) {
    throw new HttpsError('invalid-argument', 'Missing session parameters');
  }

  const targetWeight = Number.isFinite(params.supplierCapacityTargetWeight)
    ? Math.min(1, Math.max(0, params.supplierCapacityTargetWeight))
    : 0.2;
  const normalizedParams: SessionParams = {
    ...params,
    supplierCapacityTargetWeight: targetWeight,
    supplierCapacityPriorWeight: 1 - targetWeight,
  };

  const sessionCode = await generateUniqueSessionCode();
  const ref = sessionRef(db.collection('sessions').doc().id);
  const now = Date.now();
  const emptyDisruptions = buildEmptyDisruptions();

  const sessionDoc: SessionDoc = {
    id: ref.id,
    instructorUid: uid,
    sessionCode,
    sessionName: sessionName.trim(),
    status: 'lobby',
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    params: normalizedParams,
    disruptionSchedule,
    activeDisruptions: emptyDisruptions,
    currentRound: 0,
    currentPhase: 'ordering',
    playerCount: 0,
    submittedCount: 0,
    totalMarketDemand: 0,
  };

  const batch = db.batch();
  batch.set(ref, {
    instructorUid: sessionDoc.instructorUid,
    sessionCode: sessionDoc.sessionCode,
    sessionName: sessionDoc.sessionName,
    status: sessionDoc.status,
    createdAt: sessionDoc.createdAt,
    expiresAt: sessionDoc.expiresAt,
    params: sessionDoc.params,
    disruptionSchedule: sessionDoc.disruptionSchedule,
    activeDisruptions: sessionDoc.activeDisruptions,
    currentRound: sessionDoc.currentRound,
    currentPhase: sessionDoc.currentPhase,
    playerCount: sessionDoc.playerCount,
    submittedCount: sessionDoc.submittedCount,
    totalMarketDemand: sessionDoc.totalMarketDemand,
  });
  batch.set(sessionPublicStateRef(ref.id), toSessionPublicState(ref.id, sessionDoc));
  batch.set(sessionInstructorStateRef(ref.id), toSessionInstructorState(ref.id, []));
  await batch.commit();

  return { sessionId: ref.id, sessionCode };
});
