import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlayerStateDoc, SessionDoc, SessionPlayerDoc, SessionPublicState } from '../types';

interface GameContextValue {
  session: SessionDoc | null;
  playerState: PlayerStateDoc | null;
  playerName: string | null;
  sessionId: string | null;
  playerId: string | null;
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
  const [identity, setIdentity] = useState(loadStoredIdentity);
  const [sessionMeta, setSessionMeta] = useState<SessionDoc | null>(null);
  const [publicState, setPublicState] = useState<SessionPublicState | null>(null);
  const [playerRoster, setPlayerRoster] = useState<SessionPlayerDoc | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateDoc | null>(null);

  const sessionId = identity.sessionId;
  const playerId = identity.playerId;

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    let cancelled = false;
    getDoc(doc(db, 'sessions', sessionId)).then((snap) => {
      if (!cancelled) {
        setSessionMeta(snap.exists() ? ({ id: snap.id, ...snap.data() } as SessionDoc) : null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    return onSnapshot(doc(db, 'sessions', sessionId, 'state', 'public'), (snap) => {
      setPublicState(snap.exists() ? (snap.data() as SessionPublicState) : null);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId) {
      return undefined;
    }

    return onSnapshot(doc(db, 'sessions', sessionId, 'players', playerId), (snap) => {
      setPlayerRoster(snap.exists() ? (snap.data() as SessionPlayerDoc) : null);
    });
  }, [playerId, sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId) {
      return undefined;
    }

    return onSnapshot(doc(db, 'sessions', sessionId, 'playerStates', playerId), (snap) => {
      setPlayerState(snap.exists() ? (snap.data() as PlayerStateDoc) : null);
    });
  }, [playerId, sessionId]);

  const setPlayerIdentity = (sid: string, pid: string) => {
    setSessionMeta(null);
    setPublicState(null);
    setPlayerRoster(null);
    setPlayerState(null);
    setIdentity({ sessionId: sid, playerId: pid });
    storage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sid, playerId: pid }));
    localStorage.removeItem(STORAGE_KEY);
  };

  const clearPlayerIdentity = () => {
    setIdentity({ sessionId: null, playerId: null });
    setSessionMeta(null);
    setPublicState(null);
    setPlayerRoster(null);
    setPlayerState(null);
    storage.removeItem(STORAGE_KEY);
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
    } satisfies SessionDoc;
  }, [publicState, sessionMeta]);

  const loading = Boolean(sessionId && !sessionMeta && !publicState);

  return (
    <GameContext.Provider value={{ session, playerState, playerName, sessionId, playerId, loading, setPlayerIdentity, clearPlayerIdentity }}>
      {children}
    </GameContext.Provider>
  );
}
