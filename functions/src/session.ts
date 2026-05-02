import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SessionDoc, SessionPlayerDoc } from './types';
import { CALLABLE_OPTIONS } from './callableOptions';
import { assertRateLimit } from './rateLimiter';
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
const SESSION_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;
const MAX_PLAYERS_PER_SESSION = 100;

function generatePlayerId(): string {
  return db.collection('_temp').doc().id;
}

function validatePlayerEntryInput(
  uid: string | undefined,
  sessionCode: string | undefined,
  playerName: string | undefined,
) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required before joining a session');
  }
  if (!sessionCode || typeof sessionCode !== 'string') {
    throw new HttpsError('invalid-argument', 'Session code is required');
  }
  if (!SESSION_CODE_REGEX.test(sessionCode.toUpperCase().trim())) {
    throw new HttpsError('invalid-argument', 'Invalid session code format');
  }
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Player name is required');
  }
}

async function enterSessionWithName(uid: string, sessionCode: string, playerName: string) {
  const trimmedName = playerName.trim().replace(/\s+/g, ' ');
  const nameKey = normalizePlayerName(trimmedName);
  const sessionSnap = await getSessionByCode(sessionCode);

  if (!sessionSnap) {
    throw new HttpsError('not-found', 'No session found with that code');
  }

  const sessionData = sessionSnap.data() as SessionDoc;
  const sessionId = sessionSnap.id;
  let playerId: string | undefined;
  let action: 'joined' | 'reconnected' = 'joined';
  const joinedAt = Date.now();

  await db.runTransaction(async (transaction) => {
    const freshSessionSnap = await transaction.get(sessionRef(sessionId));
    if (!freshSessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const freshSession = { id: freshSessionSnap.id, ...freshSessionSnap.data() } as SessionDoc;
    const playerNameSnap = await transaction.get(sessionPlayerNameRef(sessionId, nameKey));

    if (freshSession.status === 'lobby') {
      if ((freshSession.playerCount ?? 0) >= MAX_PLAYERS_PER_SESSION) {
        throw new HttpsError(
          'resource-exhausted',
          `This session has reached the maximum of ${MAX_PLAYERS_PER_SESSION} players.`,
        );
      }
      if (playerNameSnap.exists) {
        throw new HttpsError('already-exists', 'A player with that name already exists in this session');
      }

      playerId = generatePlayerId();
      action = 'joined';

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
      return;
    }

    if (freshSession.status === 'expired') {
      throw new HttpsError('failed-precondition', 'This session has expired');
    }

    if (!playerNameSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'This session has already started. Only existing players can reconnect.',
      );
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
    action = 'reconnected';

    transaction.update(sessionPlayerRef(sessionId, playerId), {
      connected: true,
      authUid: uid,
    });
    transaction.update(sessionPlayerNameRef(sessionId, nameKey), {
      authUid: uid,
      reconnectedAt: joinedAt,
    });
    transaction.set(
      sessionMemberRef(sessionId, uid),
      {
        playerId,
        playerName: trimmedName,
        reconnectedAt: joinedAt,
      },
      { merge: true },
    );

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
    action,
  };
}

export const joinSession = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  const { sessionCode, playerName } = request.data as { sessionCode?: string; playerName?: string };

  validatePlayerEntryInput(uid, sessionCode, playerName);
  await assertRateLimit(uid as string, 'sessionEntry', {
    max: 10,
    windowMs: 60_000,
    message: 'Too many join attempts. Please wait a minute and try again.',
  });
  return enterSessionWithName(uid as string, sessionCode as string, playerName as string);
});

export const reconnectPlayer = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  const { sessionCode, playerName } = request.data as { sessionCode?: string; playerName?: string };

  validatePlayerEntryInput(uid, sessionCode, playerName);
  await assertRateLimit(uid as string, 'sessionEntry', {
    max: 10,
    windowMs: 60_000,
    message: 'Too many reconnect attempts. Please wait a minute and try again.',
  });
  return enterSessionWithName(uid as string, sessionCode as string, playerName as string);
});
