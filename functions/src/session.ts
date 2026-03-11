import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SessionDoc, SessionPlayerDoc } from './types';
import {
  getSessionByCode,
  normalizePlayerName,
  sessionMemberRef,
  sessionPlayerNameRef,
  sessionPlayerRef,
  sessionPublicStateRef,
  sessionRef,
  toSessionPublicState,
} from './sessionState';

const db = admin.firestore();

function generatePlayerId(): string {
  return db.collection('_temp').doc().id;
}

export const joinSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  const { sessionCode, playerName } = request.data as { sessionCode?: string; playerName?: string };

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required before joining a session');
  }
  if (!sessionCode || typeof sessionCode !== 'string') {
    throw new HttpsError('invalid-argument', 'Session code is required');
  }
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Player name is required');
  }

  const trimmedName = playerName.trim().replace(/\s+/g, ' ');
  const nameKey = normalizePlayerName(trimmedName);
  const sessionSnap = await getSessionByCode(sessionCode);

  if (!sessionSnap) {
    throw new HttpsError('not-found', 'No session found with that code');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() } as SessionDoc;
  const sessionId = sessionSnap.id;
  const playerId = generatePlayerId();
  const joinedAt = Date.now();

  await db.runTransaction(async (transaction) => {
    const freshSessionSnap = await transaction.get(sessionRef(sessionId));
    if (!freshSessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const freshSession = { id: freshSessionSnap.id, ...freshSessionSnap.data() } as SessionDoc;
    if (freshSession.status !== 'lobby') {
      throw new HttpsError('failed-precondition', 'This session is no longer accepting players');
    }

    const playerNameSnap = await transaction.get(sessionPlayerNameRef(sessionId, nameKey));
    if (playerNameSnap.exists) {
      throw new HttpsError('already-exists', 'A player with that name already exists in this session');
    }

    const playerDoc: SessionPlayerDoc = {
      playerId,
      sessionId,
      playerName: trimmedName,
      nameKey,
      authUid: uid,
      connected: true,
      joinedAt,
      currentCash: freshSession.params.startingCash,
      currentInventory: 0,
      currentDemand: freshSession.params.startingDemand,
    };

    transaction.set(sessionPlayerRef(sessionId, playerId), playerDoc);
    transaction.set(sessionPlayerNameRef(sessionId, nameKey), {
      playerId,
      playerName: trimmedName,
      authUid: uid,
      createdAt: joinedAt,
    });
    transaction.set(sessionMemberRef(sessionId, uid), {
      playerId,
      playerName: trimmedName,
      joinedAt,
    });
    transaction.update(sessionRef(sessionId), { playerCount: admin.firestore.FieldValue.increment(1) });
    transaction.set(
      sessionPublicStateRef(sessionId),
      {
        ...toSessionPublicState(sessionId, freshSession),
        playerCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
  });

  return {
    sessionId,
    playerId,
    sessionName: session.sessionName,
  };
});

export const reconnectPlayer = onCall(async (request) => {
  const uid = request.auth?.uid;
  const { sessionCode, playerName } = request.data as { sessionCode?: string; playerName?: string };

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required before reconnecting');
  }
  if (!sessionCode || !playerName) {
    throw new HttpsError('invalid-argument', 'Session code and player name are required');
  }

  const trimmedName = playerName.trim().replace(/\s+/g, ' ');
  const nameKey = normalizePlayerName(trimmedName);
  const sessionSnap = await getSessionByCode(sessionCode);

  if (!sessionSnap) {
    throw new HttpsError('not-found', 'No session found with that code');
  }

  const sessionId = sessionSnap.id;
  const sessionData = sessionSnap.data() as SessionDoc;
  let playerId: string | undefined;

  await db.runTransaction(async (transaction) => {
    const playerNameSnap = await transaction.get(sessionPlayerNameRef(sessionId, nameKey));
    if (!playerNameSnap.exists) {
      throw new HttpsError('not-found', 'No player with that name found in this session');
    }

    playerId = playerNameSnap.data()?.playerId as string | undefined;
    if (!playerId) {
      throw new HttpsError('data-loss', 'Player roster entry is incomplete');
    }

    const playerSnap = await transaction.get(sessionPlayerRef(sessionId, playerId));
    if (!playerSnap.exists) {
      throw new HttpsError('not-found', 'Player not found in this session');
    }

    const previousAuthUid = playerSnap.data()?.authUid as string | undefined;
    transaction.update(sessionPlayerRef(sessionId, playerId), {
      connected: true,
      authUid: uid,
    });
    transaction.update(sessionPlayerNameRef(sessionId, nameKey), {
      authUid: uid,
      reconnectedAt: Date.now(),
    });
    transaction.set(sessionMemberRef(sessionId, uid), {
      playerId,
      playerName: trimmedName,
      reconnectedAt: Date.now(),
    }, { merge: true });

    if (previousAuthUid && previousAuthUid !== uid) {
      transaction.delete(sessionMemberRef(sessionId, previousAuthUid));
    }
  });

  if (!playerId) {
    throw new HttpsError('data-loss', 'Player roster entry is incomplete');
  }

  return {
    sessionId,
    playerId,
    sessionName: sessionData.sessionName,
  };
});
