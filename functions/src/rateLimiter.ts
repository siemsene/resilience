import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

interface RateLimitOptions {
  max: number;
  windowMs: number;
  message?: string;
}

const db = admin.firestore();

export async function assertRateLimit(
  uid: string,
  action: string,
  { max, windowMs, message }: RateLimitOptions,
) {
  const ref = db.collection('rateLimits').doc(`${uid}_${action}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; windowStart?: number } | undefined;

    if (!data || typeof data.windowStart !== 'number' || now - data.windowStart >= windowMs) {
      tx.set(ref, {
        count: 1,
        windowStart: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs * 2),
      });
      return;
    }

    if ((data.count ?? 0) >= max) {
      throw new HttpsError(
        'resource-exhausted',
        message ?? `Too many ${action} attempts. Please wait and try again.`,
      );
    }

    tx.update(ref, { count: (data.count ?? 0) + 1 });
  });
}
