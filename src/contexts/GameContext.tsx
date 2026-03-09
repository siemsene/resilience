import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { SessionDoc, PlayerStateDoc } from '../types';

interface GameContextValue {
  session: SessionDoc | null;
  playerState: PlayerStateDoc | null;
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
    // ignore invalid local storage
  }
  return { sessionId: null, playerId: null };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState(loadStoredIdentity);
  const [sessionRecord, setSessionRecord] = useState<{ key: string | null; data: SessionDoc | null }>({
    key: null,
    data: null,
  });
  const [playerStateRecord, setPlayerStateRecord] = useState<{ key: string | null; data: PlayerStateDoc | null }>({
    key: null,
    data: null,
  });

  const sessionId = identity.sessionId;
  const playerId = identity.playerId;
  const playerStateKey = sessionId && playerId ? `${sessionId}:${playerId}` : null;

  // Identity is loaded synchronously from sessionStorage (tab-local).
  const loading = false;

  // Session listener
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSessionRecord({ key: sessionId, data: { id: snap.id, ...snap.data() } as SessionDoc });
      } else {
        setSessionRecord({ key: sessionId, data: null });
      }
    });

    return unsub;
  }, [sessionId]);

  // Player state listener
  useEffect(() => {
    if (!sessionId || !playerId || !playerStateKey) {
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'sessions', sessionId, 'playerStates', playerId),
      (snap) => {
        if (snap.exists()) {
          setPlayerStateRecord({ key: playerStateKey, data: snap.data() as PlayerStateDoc });
        } else {
          setPlayerStateRecord({ key: playerStateKey, data: null });
        }
      }
    );

    return unsub;
  }, [playerId, playerStateKey, sessionId]);

  const setPlayerIdentity = (sid: string, pid: string) => {
    setIdentity({ sessionId: sid, playerId: pid });
    storage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sid, playerId: pid }));
    localStorage.removeItem(STORAGE_KEY); // remove any legacy cross-tab value
  };

  const clearPlayerIdentity = () => {
    setIdentity({ sessionId: null, playerId: null });
    setSessionRecord({ key: null, data: null });
    setPlayerStateRecord({ key: null, data: null });
    storage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  };

  const session = sessionId && sessionRecord.key === sessionId ? sessionRecord.data : null;
  const playerState =
    playerStateKey && playerStateRecord.key === playerStateKey ? playerStateRecord.data : null;

  return (
    <GameContext.Provider value={{ session, playerState, sessionId, playerId, loading, setPlayerIdentity, clearPlayerIdentity }}>
      {children}
    </GameContext.Provider>
  );
}
