import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const cleanupExpiredSessions = onSchedule('every 24 hours', async () => {
  const now = Date.now();
  const expiredSnap = await db.collection('sessions')
    .where('expiresAt', '<', now)
    .where('status', 'in', ['lobby', 'setup', 'active'])
    .get();

  const batch = db.batch();
  let count = 0;

  expiredSnap.forEach((doc) => {
    batch.update(doc.ref, { status: 'expired' });
    count++;
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Marked ${count} sessions as expired`);
  }
});
