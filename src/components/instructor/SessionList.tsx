import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { SessionDoc } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './SessionList.module.css';

interface Props {
  onSelect: (sessionId: string) => void;
}

export function SessionList({ onSelect }: Props) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SessionDoc | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'sessions'),
        where('instructorUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setSessions(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SessionDoc)));
      }
    );
    return unsub;
  }, [user]);

  const oldSessions = useMemo(
    () => sessions.filter((session) => session.status === 'completed' || session.status === 'expired'),
    [sessions]
  );

  const deleteSession = httpsCallable<{ sessionId: string }, { success: boolean }>(functions, 'deleteSession');

  const getErrorMessage = (err: unknown, fallback: string) => (
    err instanceof Error ? err.message : fallback
  );

  const statusColor = (status: SessionDoc['status']) => {
    switch (status) {
      case 'lobby': return 'var(--color-info)';
      case 'setup': return 'var(--color-warning)';
      case 'active': return 'var(--color-success)';
      case 'completed': return 'var(--text-light)';
      default: return 'var(--text-light)';
    }
  };

  const confirmDelete = (session: SessionDoc) => {
    setError('');
    setDeleteTarget(session);
  };

  const handleDeleteSession = async (session: SessionDoc) => {
    setError('');
    setDeletingSessionId(session.id);
    try {
      await deleteSession({ sessionId: session.id });
      if (deleteTarget?.id === session.id) {
        setDeleteTarget(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete session'));
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleDeleteOldSessions = async () => {
    if (oldSessions.length === 0) {
      return;
    }

    setError('');
    setBulkDeleting(true);
    try {
      for (const session of oldSessions) {
        await deleteSession({ sessionId: session.id });
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete old sessions'));
    } finally {
      setBulkDeleting(false);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className={s.emptyState}>
        <p>No sessions yet. Create your first session to get started.</p>
      </div>
    );
  }

  return (
    <div className={styles.listLayout}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarCopy}>
          <h2 className={styles.toolbarTitle}>Your Sessions</h2>
          <p className={styles.toolbarSubtitle}>
            {oldSessions.length > 0
              ? `${oldSessions.length} completed or expired session${oldSessions.length === 1 ? '' : 's'} can be removed without opening them.`
              : 'Open any session to manage it, or create a new one.'}
          </p>
        </div>
        <button
          className={s.btnDanger}
          onClick={handleDeleteOldSessions}
          disabled={oldSessions.length === 0 || bulkDeleting || deletingSessionId !== null}
        >
          {bulkDeleting ? 'Removing Old Sessions...' : `Remove Old Sessions${oldSessions.length > 0 ? ` (${oldSessions.length})` : ''}`}
        </button>
      </div>

      {(error || deleteTarget) && (
        <div className={`${s.card} ${styles.noticeCard}`}>
          {error && <p className={s.error} style={{ margin: 0 }}>{error}</p>}
          {deleteTarget && (
            <div className={styles.confirmRow}>
              <span>Delete "{deleteTarget.sessionName}" permanently? This cannot be undone.</span>
              <div className={styles.confirmActions}>
                <button
                  className={s.btnDanger}
                  onClick={() => handleDeleteSession(deleteTarget)}
                  disabled={bulkDeleting || deletingSessionId !== null}
                >
                  {deletingSessionId === deleteTarget.id ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  className={s.btnSecondary}
                  onClick={() => setDeleteTarget(null)}
                  disabled={bulkDeleting || deletingSessionId !== null}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.grid}>
        {sessions.map((session) => {
          const isOldSession = session.status === 'completed' || session.status === 'expired';

          return (
            <article
              key={session.id}
              className={styles.sessionCard}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(session.id);
                }
              }}
            >
              <div className={styles.cardHeader}>
                <span className={styles.sessionName}>{session.sessionName}</span>
                <span className={styles.status} style={{ color: statusColor(session.status) }}>
                  {session.status}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Code</span>
                  <code className={styles.code}>{session.sessionCode}</code>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Players</span>
                  <span>{session.playerCount}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Round</span>
                  <span>{session.currentRound || 0} / {session.params?.totalRounds || 30}</span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                <span>Created {new Date(session.createdAt).toLocaleDateString()}</span>
                {isOldSession && (
                  <button
                    className={`${s.btnDanger} ${s.btnSmall}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      confirmDelete(session);
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                    }}
                    disabled={bulkDeleting || deletingSessionId !== null}
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
