import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const RETAIN_EXPIRED_MS = 7 * 24 * 60 * 60 * 1000;

export const cleanupExpiredSessions = onSchedule('every 24 hours', async () => {
  const now = Date.now();
  const activeExpiredSnap = await db.collection('sessions')
    .where('expiresAt', '<', now)
    .where('status', 'in', ['lobby', 'setup', 'active'])
    .get();

  if (!activeExpiredSnap.empty) {
    const batch = db.batch();
    activeExpiredSnap.forEach((doc) => {
      batch.update(doc.ref, { status: 'expired', expiredAt: now });
    });
    await batch.commit();
    console.log(`Marked ${activeExpiredSnap.size} sessions as expired`);
  }

  const deleteBefore = now - RETAIN_EXPIRED_MS;
  const staleExpiredSnap = await db.collection('sessions')
    .where('status', '==', 'expired')
    .where('expiresAt', '<', deleteBefore)
    .get();

  for (const doc of staleExpiredSnap.docs) {
    await db.recursiveDelete(doc.ref);
  }

  if (!staleExpiredSnap.empty) {
    console.log(`Deleted ${staleExpiredSnap.size} expired sessions past retention`);
  }
});
