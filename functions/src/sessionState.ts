import * as admin from 'firebase-admin';
import type {
  ActiveDisruption,
  Country,
  SessionDoc,
  SessionInstructorState,
  SessionPublicState,
  SupplierCapacityMap,
} from './types';

const db = admin.firestore();

export function sessionRef(sessionId: string) {
  return db.collection('sessions').doc(sessionId);
}

export function sessionPublicStateRef(sessionId: string) {
  return sessionRef(sessionId).collection('state').doc('public');
}

export function sessionInstructorStateRef(sessionId: string) {
  return sessionRef(sessionId).collection('state').doc('instructor');
}

export function sessionPlayersRef(sessionId: string) {
  return sessionRef(sessionId).collection('players');
}

export function sessionPlayerRef(sessionId: string, playerId: string) {
  return sessionPlayersRef(sessionId).doc(playerId);
}

export function sessionPlayerNameRef(sessionId: string, nameKey: string) {
  return sessionRef(sessionId).collection('playerNames').doc(nameKey);
}

export function sessionMemberRef(sessionId: string, authUid: string) {
  return sessionRef(sessionId).collection('members').doc(authUid);
}

export function normalizePlayerName(playerName: string) {
  return playerName.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildEmptyDisruptions(): Record<Country, ActiveDisruption | null> {
  return { china: null, mexico: null, us: null };
}

export function toSessionPublicState(sessionId: string, session: Pick<SessionDoc, 'status' | 'currentRound' | 'currentPhase' | 'activeDisruptions' | 'submittedCount' | 'playerCount' | 'totalMarketDemand' | 'resultsRound' | 'resultsConfirmedCount'>): SessionPublicState {
  return {
    sessionId,
    status: session.status,
    currentRound: session.currentRound,
    currentPhase: session.currentPhase,
    activeDisruptions: session.activeDisruptions,
    submittedCount: session.submittedCount,
    playerCount: session.playerCount,
    totalMarketDemand: session.totalMarketDemand,
    ...(session.resultsRound != null ? { resultsRound: session.resultsRound } : {}),
    ...(session.resultsConfirmedCount != null ? { resultsConfirmedCount: session.resultsConfirmedCount } : {}),
  };
}

export function toSessionInstructorState(
  sessionId: string,
  submittedPlayerIds: string[],
  supplierCapacities?: SupplierCapacityMap,
  resultsRound?: number,
  resultsConfirmedPlayerIds?: string[],
): SessionInstructorState {
  return {
    sessionId,
    submittedPlayerIds,
    updatedAt: Date.now(),
    ...(supplierCapacities ? { supplierCapacities } : {}),
    ...(resultsRound != null ? { resultsRound } : {}),
    ...(resultsConfirmedPlayerIds ? { resultsConfirmedPlayerIds } : {}),
  };
}

export async function getSessionByCode(sessionCode: string) {
  const upperCode = sessionCode.toUpperCase().trim();
  const sessionsSnap = await db.collection('sessions')
    .where('sessionCode', '==', upperCode)
    .limit(1)
    .get();

  if (sessionsSnap.empty) {
    return null;
  }

  return sessionsSnap.docs[0];
}

