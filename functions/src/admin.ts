import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type { InstructorStatus } from './types';

const db = admin.firestore();
const adminEmail = defineString('ADMIN_EMAIL');

function assertAdmin(request: { auth?: { token?: { email?: string | null } } }) {
  const email = request.auth?.token?.email;
  const role = (request.auth?.token as { role?: string } | undefined)?.role;
  if (!email) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  if (role !== 'admin' && email.toLowerCase() !== adminEmail.value().toLowerCase()) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}

export const adminListInstructors = onCall(async (request) => {
  assertAdmin(request);

  const snap = await db.collection('instructors').orderBy('appliedAt', 'desc').get();
  const instructors = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  return { instructors };
});

export const adminListSessions = onCall(async (request) => {
  assertAdmin(request);

  const snap = await db.collection('sessions').orderBy('createdAt', 'desc').limit(100).get();
  const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { sessions };
});

export const adminUpdateInstructorStatus = onCall(async (request) => {
  assertAdmin(request);

  const { uid, status } = request.data as { uid?: string; status?: InstructorStatus };
  const validStatuses: InstructorStatus[] = ['approved', 'denied', 'revoked', 'pending'];

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'uid is required');
  }
  if (!status || !validStatuses.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid status');
  }

  const ref = db.collection('instructors').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Instructor not found');
  }

  await ref.update({
    status,
    reviewedAt: Date.now(),
  });

  return { success: true };
});
