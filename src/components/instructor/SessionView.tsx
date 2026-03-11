import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import type { SessionDoc, SessionInstructorState, SessionPlayerDoc, SessionPublicState } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './SessionView.module.css';

interface Props {
  sessionId: string;
  onDeleted: () => void;
}

type ConfirmAction = 'end' | 'delete' | null;

const PAGE_SIZE = 20;

export function SessionView({ sessionId, onDeleted }: Props) {
  const navigate = useNavigate();
  const [sessionMeta, setSessionMeta] = useState<SessionDoc | null>(null);
  const [publicState, setPublicState] = useState<SessionPublicState | null>(null);
  const [instructorState, setInstructorState] = useState<SessionInstructorState | null>(null);
  const [players, setPlayers] = useState<SessionPlayerDoc[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  useEffect(() => onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
    setSessionMeta(snap.exists() ? ({ id: snap.id, ...snap.data() } as SessionDoc) : null);
  }), [sessionId]);

  useEffect(() => onSnapshot(doc(db, 'sessions', sessionId, 'state', 'public'), (snap) => {
    setPublicState(snap.exists() ? (snap.data() as SessionPublicState) : null);
  }), [sessionId]);

  useEffect(() => onSnapshot(doc(db, 'sessions', sessionId, 'state', 'instructor'), (snap) => {
    setInstructorState(snap.exists() ? (snap.data() as SessionInstructorState) : null);
  }), [sessionId]);

  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    getDocs(query(collection(db, 'sessions', sessionId, 'players'), orderBy('joinedAt', 'asc')))
      .then((snap) => {
        if (!cancelled) {
          setPlayers(snap.docs.map((docSnap) => docSnap.data() as SessionPlayerDoc));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Failed to load players'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlayersLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionMeta?.playerCount, publicState?.currentRound, publicState?.currentPhase]);

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
      playerCount: publicState.playerCount,
      submittedCount: publicState.submittedCount,
      totalMarketDemand: publicState.totalMarketDemand,
      resultsRound: publicState.resultsRound,
      resultsConfirmedCount: publicState.resultsConfirmedCount,
    } satisfies SessionDoc;
  }, [publicState, sessionMeta]);

  const filteredPlayers = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();
    const next = (loweredSearch.length === 0
      ? players
      : players.filter((player) => player.playerName.toLowerCase().includes(loweredSearch))).slice();

    next.sort((a, b) => {
      return (b.currentCash || 0) - (a.currentCash || 0);
    });

    return [...next];
  }, [players, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const pagePlayers = filteredPlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const submitted = new Set(instructorState?.submittedPlayerIds || []);
  const supplierCapacities = instructorState?.supplierCapacities;
  const capacityRound = supplierCapacities ? supplierCapacities[SUPPLIER_KEYS[0]]?.capacityRound : null;
  const submissionPct = session?.playerCount ? (session.submittedCount / session.playerCount) * 100 : 0;

  useEffect(() => {
    setPage(1);
  }, [search]);

  const runAction = async (callableName: 'startGame' | 'forceAdvance' | 'endSessionEarly' | 'deleteSession') => {
    setError('');
    setActionLoading(true);
    try {
      const callable = httpsCallable<{ sessionId: string }, { success: boolean }>(functions, callableName);
      await callable({ sessionId });
      if (callableName === 'deleteSession') {
        onDeleted();
      }
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${callableName}`));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  if (!session) {
    return <div className={s.loadingPage}><div className={s.spinner} /></div>;
  }

  return (
    <div>
      <div className={`${s.card} ${styles.sessionHeader}`}>
        <div>
          <h2>{session.sessionName}</h2>
          <div className={styles.sessionMeta}>
            <span>Code: <code className={styles.code}>{session.sessionCode}</code></span>
            <span>Status: <strong>{session.status}</strong></span>
            <span>Round: {session.currentRound} / {session.params.totalRounds}</span>
            {(session.status === 'setup' || session.status === 'active') && <span>Phase: {session.currentPhase}</span>}
          </div>
        </div>
        <div className={styles.sessionActions}>
          {session.status === 'lobby' && (
            <button className={s.btnSuccess} onClick={() => runAction('startGame')} disabled={actionLoading || session.playerCount < 1}>
              {actionLoading ? 'Starting...' : 'Start Game'}
            </button>
          )}
          {(session.status === 'setup' || (session.status === 'active' && (session.currentPhase === 'ordering' || session.currentPhase === 'results'))) && (
            <button className={s.btnSecondary} onClick={() => runAction('forceAdvance')} disabled={actionLoading}>
              {actionLoading ? 'Advancing...' : session.currentPhase === 'results' ? 'Force Next Round' : 'Force Advance'}
            </button>
          )}
          {session.status === 'completed' && (
            <button className={s.btnPrimary} onClick={() => navigate(`/results/${sessionId}`)}>
              View Results
            </button>
          )}
          {(session.status === 'lobby' || session.status === 'setup' || session.status === 'active') && (
            <button className={s.btnDanger} onClick={() => setConfirmAction('end')} disabled={actionLoading}>
              End Session Early
            </button>
          )}
          <button className={s.btnDanger} onClick={() => setConfirmAction('delete')} disabled={actionLoading}>
            Delete Session
          </button>
        </div>
      </div>

      {(error || confirmAction) && (
        <div className={`${s.card} ${styles.noticeCard}`}>
          {error && <p className={s.error} style={{ margin: 0 }}>{error}</p>}
          {confirmAction === 'end' && (
            <div className={styles.confirmRow}>
              <span>End this session now and send players to results?</span>
              <div className={styles.confirmActions}>
                <button className={s.btnDanger} onClick={() => runAction('endSessionEarly')} disabled={actionLoading}>Confirm</button>
                <button className={s.btnSecondary} onClick={() => setConfirmAction(null)} disabled={actionLoading}>Cancel</button>
              </div>
            </div>
          )}
          {confirmAction === 'delete' && (
            <div className={styles.confirmRow}>
              <span>Delete this session permanently? This cannot be undone.</span>
              <div className={styles.confirmActions}>
                <button className={s.btnDanger} onClick={() => runAction('deleteSession')} disabled={actionLoading}>Delete</button>
                <button className={s.btnSecondary} onClick={() => setConfirmAction(null)} disabled={actionLoading}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.playerHeaderRow}>
          <h3>Players ({session.playerCount})</h3>
          <div className={styles.playerControls}>
            <input
              className={`${s.input} ${styles.searchInput}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
            />
          </div>
        </div>

        {session.status === 'lobby' ? (
          <div className={styles.playerGrid}>
            {players.map((player) => (
              <div key={player.playerId} className={`${s.card} ${styles.playerCard}`}>
                <span className={styles.playerName}>{player.playerName}</span>
                <span className={styles.playerStatus}>{player.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            ))}
            {players.length === 0 && !playersLoading && (
              <p className={s.emptyState}>Waiting for players to join with code <code className={styles.code}>{session.sessionCode}</code></p>
            )}
          </div>
        ) : (
          <>
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
                {pagePlayers.map((player, index) => (
                  <tr key={player.playerId}>
                    <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td><strong>{player.playerName}</strong></td>
                    <td>${player.currentCash.toLocaleString()}</td>
                    <td>{player.currentInventory.toLocaleString()}</td>
                    <td>{player.currentDemand.toLocaleString()}</td>
                    <td>
                      {submitted.has(player.playerId)
                        ? <span className={s.badgeApproved}>Submitted</span>
                        : <span className={s.badgePending}>Waiting</span>}
                    </td>
                  </tr>
                ))}
                {!playersLoading && pagePlayers.length === 0 && (
                  <tr><td colSpan={6} className={s.emptyState}>No players match the current filters.</td></tr>
                )}
              </tbody>
            </table>
            <div className={styles.paginationRow}>
              <span>{playersLoading ? 'Refreshing roster...' : `Showing ${pagePlayers.length} of ${filteredPlayers.length} players`}</span>
              <div className={styles.confirmActions}>
                <button className={s.btnSecondary} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</button>
                <span>Page {page} / {totalPages}</span>
                <button className={s.btnSecondary} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {supplierCapacities && (
        <div className={styles.section}>
          <div className={styles.capacityHeaderRow}>
            <h3>Supplier Capacity</h3>
            {capacityRound != null && <span className={styles.capacityRoundTag}>Applies to round {capacityRound}</span>}
          </div>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Actual Capacity</th>
                <th>Target Capacity</th>
                <th>Last-Round Orders</th>
              </tr>
            </thead>
            <tbody>
              {SUPPLIER_KEYS.map((key) => (
                <tr key={key}>
                  <td><strong>{SUPPLIER_LABELS[key]}</strong></td>
                  <td>{supplierCapacities[key]?.actualCapacity?.toLocaleString() ?? '-'}</td>
                  <td>{supplierCapacities[key]?.targetCapacity?.toLocaleString() ?? '-'}</td>
                  <td>{supplierCapacities[key]?.lastRoundOrders?.toLocaleString() ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
            {!Object.values(session.activeDisruptions || {}).some(Boolean) && <p style={{ color: 'var(--text-light)' }}>No active disruptions</p>}
          </div>
        </div>
      )}

      {(session.status === 'setup' || (session.status === 'active' && session.currentPhase === 'ordering')) && (
        <div className={styles.section}>
          <h3>Submission Progress</h3>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${submissionPct}%` }} />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {session.submittedCount} / {session.playerCount} players submitted
          </p>
        </div>
      )}

      {session.status === 'active' && session.currentPhase === 'results' && (
        <div className={styles.section}>
          <h3>Results Confirmation</h3>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${session.playerCount ? (((session.resultsConfirmedCount || 0) / session.playerCount) * 100) : 0}%`,
              }}
            />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {(session.resultsConfirmedCount || 0).toLocaleString()} / {session.playerCount.toLocaleString()} players confirmed round {session.resultsRound ?? session.currentRound - 1}
          </p>
        </div>
      )}
    </div>
  );
}

