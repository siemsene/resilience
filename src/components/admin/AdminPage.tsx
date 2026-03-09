import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { InstructorRecord, InstructorStatus, SessionDoc } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './AdminPage.module.css';

export function AdminPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [instructors, setInstructors] = useState<InstructorRecord[]>([]);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [error, setError] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  const fetchInstructors = async () => {
    const listFn = httpsCallable<undefined, { instructors: InstructorRecord[] }>(functions, 'adminListInstructors');
    const result = await listFn();
    setInstructors(result.data.instructors || []);
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchInstructors().catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Failed to load instructor applications'));
        }
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'sessions'), orderBy('createdAt', 'desc')),
      (snap) => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SessionDoc)));
      }
    );
    return unsub;
  }, []);

  const updateStatus = async (uid: string, status: InstructorStatus) => {
    setError('');
    setUpdatingUid(uid);
    try {
      const updateFn = httpsCallable<{ uid: string; status: InstructorStatus }, { success: boolean }>(
        functions,
        'adminUpdateInstructorStatus'
      );
      await updateFn({ uid, status });
      await fetchInstructors();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update instructor status'));
    }
    setUpdatingUid(null);
  };

  const pending = instructors.filter(i => i.status === 'pending');
  const others = instructors.filter(i => i.status !== 'pending');

  const statusBadge = (status: InstructorStatus) => {
    const cls = status === 'approved' ? s.badgeApproved
      : status === 'denied' ? s.badgeDenied
        : status === 'revoked' ? s.badgeRevoked
          : s.badgePending;
    return <span className={cls}>{status}</span>;
  };

  return (
    <div className={s.pageContainer}>
      <div className={styles.header}>
        <h1 className={s.pageTitle}>Admin Dashboard</h1>
        <button className={s.btnSecondary} onClick={() => { signOut(); navigate('/'); }}>
          Sign Out
        </button>
      </div>

      {/* Pending Applications */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Pending Applications
          {pending.length > 0 && <span className={styles.count}>{pending.length}</span>}
        </h2>
        {error && <p className={s.error}>{error}</p>}
        {pending.length === 0 ? (
          <p className={s.emptyState}>No pending applications</p>
        ) : (
          <div className={styles.applicationList}>
            {pending.map(inst => (
              <div key={inst.uid} className={`${s.card} ${styles.applicationCard}`}>
                <div className={styles.applicantInfo}>
                  <strong>{inst.displayName}</strong>
                  <span className={styles.meta}>{inst.email}</span>
                  <span className={styles.meta}>{inst.institution}</span>
                  <span className={styles.meta}>
                    Applied {new Date(inst.appliedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.actions}>
                  <button
                    className={s.btnSuccess}
                    onClick={() => updateStatus(inst.uid, 'approved')}
                    disabled={updatingUid === inst.uid}
                  >
                    Approve
                  </button>
                  <button
                    className={s.btnDanger}
                    onClick={() => updateStatus(inst.uid, 'denied')}
                    disabled={updatingUid === inst.uid}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All Instructors */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>All Instructors</h2>
        {others.length === 0 ? (
          <p className={s.emptyState}>No instructors yet</p>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Institution</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {others.map(inst => (
                <tr key={inst.uid}>
                  <td>{inst.displayName}</td>
                  <td>{inst.email}</td>
                  <td>{inst.institution}</td>
                  <td>{statusBadge(inst.status)}</td>
                  <td>
                    {inst.status === 'approved' && (
                      <button
                        className={`${s.btnDanger} ${s.btnSmall}`}
                        onClick={() => updateStatus(inst.uid, 'revoked')}
                        disabled={updatingUid === inst.uid}
                      >
                        Revoke
                      </button>
                    )}
                    {(inst.status === 'denied' || inst.status === 'revoked') && (
                      <button
                        className={`${s.btnSuccess} ${s.btnSmall}`}
                        onClick={() => updateStatus(inst.uid, 'approved')}
                        disabled={updatingUid === inst.uid}
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Sessions Monitor */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sessions</h2>
        {sessions.length === 0 ? (
          <p className={s.emptyState}>No sessions created yet</p>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th>Players</th>
                <th>Round</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(sess => (
                <tr key={sess.id}>
                  <td>{sess.sessionName}</td>
                  <td><code>{sess.sessionCode}</code></td>
                  <td><span className={s.badge}>{sess.status}</span></td>
                  <td>{Object.keys(sess.players || {}).length}</td>
                  <td>{sess.currentRound || '-'} / {sess.params?.totalRounds || '-'}</td>
                  <td>{new Date(sess.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
