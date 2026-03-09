import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
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

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'sessions'),
        where('instructorUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SessionDoc)));
      }
    );
    return unsub;
  }, [user]);

  const statusColor = (status: SessionDoc['status']) => {
    switch (status) {
      case 'lobby': return 'var(--color-info)';
      case 'setup': return 'var(--color-warning)';
      case 'active': return 'var(--color-success)';
      case 'completed': return 'var(--text-light)';
      default: return 'var(--text-light)';
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
    <div className={styles.grid}>
      {sessions.map(sess => (
        <button key={sess.id} className={styles.sessionCard} onClick={() => onSelect(sess.id)}>
          <div className={styles.cardHeader}>
            <span className={styles.sessionName}>{sess.sessionName}</span>
            <span className={styles.status} style={{ color: statusColor(sess.status) }}>
              {sess.status}
            </span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Code</span>
              <code className={styles.code}>{sess.sessionCode}</code>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Players</span>
              <span>{Object.keys(sess.players || {}).length}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Round</span>
              <span>{sess.currentRound || 0} / {sess.params?.totalRounds || 30}</span>
            </div>
          </div>
          <div className={styles.cardFooter}>
            Created {new Date(sess.createdAt).toLocaleDateString()}
          </div>
        </button>
      ))}
    </div>
  );
}
