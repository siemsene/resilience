import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();


function generatePlayerId(): string {
  return db.collection('_temp').doc().id;
}

export const joinSession = onCall(async (request) => {
  const { sessionCode, playerName } = request.data;

  if (!sessionCode || typeof sessionCode !== 'string') {
    throw new HttpsError('invalid-argument', 'Session code is required');
  }
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Player name is required');
  }

  const trimmedName = playerName.trim();
  const upperCode = sessionCode.toUpperCase().trim();

  // Find session by code
  const sessionsSnap = await db.collection('sessions')
    .where('sessionCode', '==', upperCode)
    .limit(1)
    .get();

  if (sessionsSnap.empty) {
    throw new HttpsError('not-found', 'No session found with that code');
  }

  const sessionDoc = sessionsSnap.docs[0];
  const sessionData = sessionDoc.data();

  if (sessionData.status !== 'lobby') {
    throw new HttpsError('failed-precondition', 'This session is no longer accepting players');
  }

  // Check for duplicate names
  const players = sessionData.players || {};
  for (const pid of Object.keys(players)) {
    if (players[pid].name.toLowerCase() === trimmedName.toLowerCase()) {
      throw new HttpsError('already-exists', 'A player with that name already exists in this session');
    }
  }

  const playerId = generatePlayerId();

  await sessionDoc.ref.update({
    [`players.${playerId}`]: {
      name: trimmedName,
      joinedAt: Date.now(),
      connected: true,
    },
  });

  return {
    sessionId: sessionDoc.id,
    playerId,
    sessionName: sessionData.sessionName,
  };
});

export const reconnectPlayer = onCall(async (request) => {
  const { sessionCode, playerName } = request.data;

  if (!sessionCode || !playerName) {
    throw new HttpsError('invalid-argument', 'Session code and player name are required');
  }

  const upperCode = sessionCode.toUpperCase().trim();
  const trimmedName = playerName.trim();

  const sessionsSnap = await db.collection('sessions')
    .where('sessionCode', '==', upperCode)
    .limit(1)
    .get();

  if (sessionsSnap.empty) {
    throw new HttpsError('not-found', 'No session found with that code');
  }

  const sessionDoc = sessionsSnap.docs[0];
  const sessionData = sessionDoc.data();
  const players = sessionData.players || {};

  for (const [pid, pinfo] of Object.entries(players) as [string, { name: string }][]) {
    if (pinfo.name.toLowerCase() === trimmedName.toLowerCase()) {
      await sessionDoc.ref.update({
        [`players.${pid}.connected`]: true,
      });
      return {
        sessionId: sessionDoc.id,
        playerId: pid,
        sessionName: sessionData.sessionName,
      };
    }
  }

  throw new HttpsError('not-found', 'No player with that name found in this session');
});
