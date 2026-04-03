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

  const [snap, completedSnap] = await Promise.all([
    db.collection('instructors').orderBy('appliedAt', 'desc').get(),
    db.collection('sessions').where('status', '==', 'completed').get(),
  ]);

  const statsMap = new Map<string, { completedSessions: number; totalPlayers: number }>();
  for (const doc of completedSnap.docs) {
    const data = doc.data();
    const uid = data.instructorUid as string | undefined;
    if (!uid) continue;
    const entry = statsMap.get(uid) ?? { completedSessions: 0, totalPlayers: 0 };
    entry.completedSessions += 1;
    entry.totalPlayers += (data.playerCount as number) || 0;
    statsMap.set(uid, entry);
  }

  const instructors = snap.docs.map((d) => {
    const stats = statsMap.get(d.id) ?? { completedSessions: 0, totalPlayers: 0 };
    return { uid: d.id, ...d.data(), ...stats };
  });

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

  if (status === 'approved') {
    await admin.auth().setCustomUserClaims(uid, { role: 'instructor' });
  } else {
    await admin.auth().setCustomUserClaims(uid, { role: null });
  }

  return { success: true };
});

export const adminResetPassword = onCall(async (request) => {
  assertAdmin(request);

  const { uid, newPassword } = request.data as { uid?: string; newPassword?: string };

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'uid is required');
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters');
  }

  const instructorSnap = await db.collection('instructors').doc(uid).get();
  if (!instructorSnap.exists) {
    throw new HttpsError('not-found', 'Instructor not found');
  }

  await admin.auth().updateUser(uid, { password: newPassword });

  return { success: true };
});
