import { useEffect, useState } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import type { SessionDoc, PlayerStateDoc } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './SessionView.module.css';

interface Props {
  sessionId: string;
  onDeleted: () => void;
}

export function SessionView({ sessionId, onDeleted }: Props) {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [playerStates, setPlayerStates] = useState<PlayerStateDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as SessionDoc);
      }
    });
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'sessions', sessionId, 'playerStates'),
      (snap) => {
        setPlayerStates(snap.docs.map(d => d.data() as PlayerStateDoc));
      }
    );
    return unsub;
  }, [sessionId]);

  const handleStartGame = async () => {
    setLoading(true);
    try {
      const startFn = httpsCallable(functions, 'startGame');
      await startFn({ sessionId });
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to start game'));
    }
    setLoading(false);
  };

  const handleForceAdvance = async () => {
    setLoading(true);
    try {
      const forceFn = httpsCallable(functions, 'forceAdvance');
      await forceFn({ sessionId });
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to force advance'));
    }
    setLoading(false);
  };

  const handleEndSessionEarly = async () => {
    const confirmed = window.confirm('End this session now? Players will be sent to results.');
    if (!confirmed) return;

    setLoading(true);
    try {
      const endFn = httpsCallable(functions, 'endSessionEarly');
      await endFn({ sessionId });
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to end session'));
    }
    setLoading(false);
  };

  const handleDeleteSession = async () => {
    const confirmed = window.confirm('Delete this session permanently? This cannot be undone.');
    if (!confirmed) return;

    setLoading(true);
    try {
      const deleteFn = httpsCallable(functions, 'deleteSession');
      await deleteFn({ sessionId });
      onDeleted();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to delete session'));
    }
    setLoading(false);
  };

  if (!session) {
    return <div className={s.loadingPage}><div className={s.spinner} /></div>;
  }

  const players = Object.entries(session.players || {});
  const submitted = new Set(session.submittedPlayers || []);
  const sortedPlayers = [...playerStates].sort((a, b) => b.cash - a.cash);
  const submissionPct = players.length === 0 ? 0 : (submitted.size / players.length) * 100;

  return (
    <div>
      {/* Session header */}
      <div className={`${s.card} ${styles.sessionHeader}`}>
        <div>
          <h2>{session.sessionName}</h2>
          <div className={styles.sessionMeta}>
            <span>Code: <code className={styles.code}>{session.sessionCode}</code></span>
            <span>Status: <strong>{session.status}</strong></span>
            <span>Round: {session.currentRound} / {session.params.totalRounds}</span>
            {session.status === 'active' && <span>Phase: {session.currentPhase}</span>}
          </div>
        </div>
        <div className={styles.sessionActions}>
          {session.status === 'lobby' && (
            <button className={s.btnSuccess} onClick={handleStartGame} disabled={loading || players.length < 1}>
              {loading ? 'Starting...' : 'Start Game'}
            </button>
          )}
          {(session.status === 'setup' || (session.status === 'active' && session.currentPhase === 'ordering')) && (
            <button className={s.btnSecondary} onClick={handleForceAdvance} disabled={loading}>
              {loading ? 'Advancing...' : 'Force Advance'}
            </button>
          )}
          {session.status === 'completed' && (
            <button className={s.btnPrimary} onClick={() => navigate(`/results/${sessionId}`)}>
              View Results
            </button>
          )}
          {(session.status === 'lobby' || session.status === 'setup' || session.status === 'active') && (
            <button className={s.btnDanger} onClick={handleEndSessionEarly} disabled={loading}>
              End Session Early
            </button>
          )}
          <button className={s.btnDanger} onClick={handleDeleteSession} disabled={loading}>
            Delete Session
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className={styles.section}>
        <h3>Players ({players.length})</h3>
        {session.status === 'lobby' ? (
          <div className={styles.playerGrid}>
            {players.map(([pid, pinfo]) => (
              <div key={pid} className={`${s.card} ${styles.playerCard}`}>
                <span className={styles.playerName}>{pinfo.name}</span>
                <span className={styles.playerStatus}>
                  {pinfo.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            ))}
            {players.length === 0 && (
              <p className={s.emptyState}>
                Waiting for players to join with code <code className={styles.code}>{session.sessionCode}</code>
              </p>
            )}
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Cash</th>
                <th>Inventory</th>
                <th>Demand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((ps, i) => (
                <tr key={ps.playerId}>
                  <td>{i + 1}</td>
                  <td><strong>{ps.playerName}</strong></td>
                  <td>${ps.cash.toLocaleString()}</td>
                  <td>{ps.inventory.toLocaleString()}</td>
                  <td>{ps.marketDemand.toLocaleString()}</td>
                  <td>
                    {submitted.has(ps.playerId) ? (
                      <span className={s.badgeApproved}>Submitted</span>
                    ) : (
                      <span className={s.badgePending}>Waiting</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedPlayers.length === 0 && players.length > 0 && (
                <tr><td colSpan={6} className={s.emptyState}>Waiting for initial setup...</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Active disruptions */}
      {session.status === 'active' && (
        <div className={styles.section}>
          <h3>Active Disruptions</h3>
          <div className={styles.disruptionList}>
            {Object.entries(session.activeDisruptions || {}).map(([country, disruption]) => (
              disruption ? (
                <div key={country} className={`${s.card} ${styles.disruptionCard}`}>
                  <strong>{country === 'us' ? 'US' : country.charAt(0).toUpperCase() + country.slice(1)}</strong>
                  <span>Rounds {disruption.startRound} - {disruption.endsAfterRound}</span>
                </div>
              ) : null
            ))}
            {!Object.values(session.activeDisruptions || {}).some(Boolean) && (
              <p style={{ color: 'var(--text-light)' }}>No active disruptions</p>
            )}
          </div>
        </div>
      )}

      {/* Submission progress */}
      {(session.status === 'setup' || (session.status === 'active' && session.currentPhase === 'ordering')) && (
        <div className={styles.section}>
          <h3>Submission Progress</h3>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${submissionPct}%` }}
            />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {submitted.size} / {players.length} players submitted
          </p>
        </div>
      )}
    </div>
  );
}
