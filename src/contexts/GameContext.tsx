import { createContext, useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { doc, getDoc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import type { PlayerStateDoc, SessionDoc, SessionMemberDoc, SessionPlayerDoc, SessionPublicState } from '../types';
import { writePlayerRemovalFlash } from '../utils/playerRemoval';

interface GameContextValue {
  session: SessionDoc | null;
  playerState: PlayerStateDoc | null;
  playerName: string | null;
  sessionId: string | null;
  playerId: string | null;
  isOffline: boolean;
  loading: boolean;
  setPlayerIdentity: (sessionId: string, playerId: string) => void;
  clearPlayerIdentity: () => void;
}

const GameContext = createContext<GameContextValue>(null!);

export function useGame() {
  return useContext(GameContext);
}

const STORAGE_KEY = 'resilience_player';
const storage = window.sessionStorage;

function loadStoredIdentity(): { sessionId: string | null; playerId: string | null } {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) {
      return { sessionId: null, playerId: null };
    }
    const parsed = JSON.parse(stored) as Partial<{ sessionId: string; playerId: string }>;
    if (typeof parsed.sessionId === 'string' && typeof parsed.playerId === 'string') {
      return { sessionId: parsed.sessionId, playerId: parsed.playerId };
    }
  } catch {
    // ignore invalid storage payloads
  }
  return { sessionId: null, playerId: null };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [identity, setIdentity] = useState(loadStoredIdentity);
  const [sessionMeta, setSessionMeta] = useState<SessionDoc | null>(null);
  const [publicState, setPublicState] = useState<SessionPublicState | null>(null);
  const [playerRoster, setPlayerRoster] = useState<SessionPlayerDoc | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateDoc | null>(null);
  const [isOffline, setIsOffline] = useState(() => !window.navigator.onLine);

  const sessionId = identity.sessionId;
  const playerId = identity.playerId;

  const resetSessionState = () => {
    setSessionMeta(null);
    setPublicState(null);
    setPlayerRoster(null);
    setPlayerState(null);
  };

  const clearPlayerIdentity = () => {
    setIdentity({ sessionId: null, playerId: null });
    resetSessionState();
    storage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleRemoval = useEffectEvent((removedPlayerName?: string | null) => {
    writePlayerRemovalFlash(removedPlayerName ?? null);
    clearPlayerIdentity();
  });

  const handleSnapshotError = useEffectEvent((err: FirestoreError) => {
    if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
      resetSessionState();
    }
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    let cancelled = false;
    getDoc(doc(db, 'sessions', sessionId))
      .then((snap) => {
        if (!cancelled) {
          setSessionMeta(snap.exists() ? ({ id: snap.id, ...snap.data() } as SessionDoc) : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId || !user) {
      return undefined;
    }

    return onSnapshot(
      doc(db, 'sessions', sessionId, 'members', user.uid),
      (snap) => {
        if (!snap.exists()) {
          return;
        }

        const member = snap.data() as SessionMemberDoc;
        if (member.removedAt && member.playerId === playerId) {
          handleRemoval(member.removedPlayerName ?? member.playerName);
        }
      },
      handleSnapshotError,
    );
  }, [playerId, sessionId, user]);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    return onSnapshot(
      doc(db, 'sessions', sessionId, 'state', 'public'),
      (snap) => {
        setPublicState(snap.exists() ? (snap.data() as SessionPublicState) : null);
      },
      handleSnapshotError,
    );
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId) {
      return undefined;
    }

    return onSnapshot(
      doc(db, 'sessions', sessionId, 'players', playerId),
      (snap) => {
        setPlayerRoster(snap.exists() ? (snap.data() as SessionPlayerDoc) : null);
      },
      handleSnapshotError,
    );
  }, [playerId, sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId) {
      return undefined;
    }

    return onSnapshot(
      doc(db, 'sessions', sessionId, 'playerStates', playerId),
      (snap) => {
        setPlayerState(snap.exists() ? (snap.data() as PlayerStateDoc) : null);
      },
      handleSnapshotError,
    );
  }, [playerId, sessionId]);

  const setPlayerIdentity = (sid: string, pid: string) => {
    resetSessionState();
    setIdentity({ sessionId: sid, playerId: pid });
    storage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sid, playerId: pid }));
    localStorage.removeItem(STORAGE_KEY);
  };

  const playerName = playerState?.playerName ?? playerRoster?.playerName ?? null;

  const session = useMemo(() => {
    if (!sessionMeta) {
      return null;
    }
    if (!publicState) {
      return sessionMeta;
    }
    return {
      ...sessionMeta,
      status: publicState.status,
      currentRound: publicState.currentRound,
      currentPhase: publicState.currentPhase,
      activeDisruptions: publicState.activeDisruptions,
      submittedCount: publicState.submittedCount,
      playerCount: publicState.playerCount,
      totalMarketDemand: publicState.totalMarketDemand,
      resultsRound: publicState.resultsRound,
      resultsConfirmedCount: publicState.resultsConfirmedCount,
      roundDeadline: publicState.roundDeadline,
    } satisfies SessionDoc;
  }, [publicState, sessionMeta]);

  const loading = Boolean(sessionId && !sessionMeta && !publicState);

  return (
    <GameContext.Provider value={{ session, playerState, playerName, sessionId, playerId, isOffline, loading, setPlayerIdentity, clearPlayerIdentity }}>
      {children}
    </GameContext.Provider>
  );
}
