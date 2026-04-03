import { useCallback, useEffect, useState } from 'react';
import { functions } from '../../firebase';
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
  const [instructorError, setInstructorError] = useState('');
  const [sessionsError, setSessionsError] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [refreshingSessions, setRefreshingSessions] = useState(false);

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  const fetchInstructors = useCallback(async () => {
    const listFn = httpsCallable<undefined, { instructors: InstructorRecord[] }>(functions, 'adminListInstructors');
    const result = await listFn();
    setInstructors(result.data.instructors || []);
  }, []);

  const fetchSessions = useCallback(async () => {
    setRefreshingSessions(true);
    try {
      const listFn = httpsCallable<undefined, { sessions: SessionDoc[] }>(functions, 'adminListSessions');
      const result = await listFn();
      setSessions(result.data.sessions || []);
    } catch (err) {
      setSessionsError(getErrorMessage(err, 'Failed to load sessions'));
    } finally {
      setRefreshingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchInstructors().catch((err) => setInstructorError(getErrorMessage(err, 'Failed to load instructor applications')));
    fetchSessions().catch((err) => setSessionsError(getErrorMessage(err, 'Failed to load sessions')));
  }, [fetchInstructors, fetchSessions]);

  const updateStatus = async (uid: string, status: InstructorStatus) => {
    setInstructorError('');
    setUpdatingUid(uid);
    try {
      const updateFn = httpsCallable<{ uid: string; status: InstructorStatus }, { success: boolean }>(functions, 'adminUpdateInstructorStatus');
      await updateFn({ uid, status });
      await fetchInstructors();
    } catch (err) {
      setInstructorError(getErrorMessage(err, 'Failed to update instructor status'));
    } finally {
      setUpdatingUid(null);
    }
  };

  const resetPassword = async (uid: string, displayName: string) => {
    const newPassword = window.prompt(`Enter new password for ${displayName} (min 6 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setInstructorError('Password must be at least 6 characters');
      return;
    }
    setInstructorError('');
    setUpdatingUid(uid);
    try {
      const resetFn = httpsCallable<{ uid: string; newPassword: string }, { success: boolean }>(functions, 'adminResetPassword');
      await resetFn({ uid, newPassword });
      alert('Password reset successfully');
    } catch (err) {
      setInstructorError(getErrorMessage(err, 'Failed to reset password'));
    } finally {
      setUpdatingUid(null);
    }
  };

  const pending = instructors.filter((i) => i.status === 'pending');
  const others = instructors.filter((i) => i.status !== 'pending');

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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Pending Applications
          {pending.length > 0 && <span className={styles.count}>{pending.length}</span>}
        </h2>
        {instructorError && <p className={s.error}>{instructorError}</p>}
        {pending.length === 0 ? (
          <p className={s.emptyState}>No pending applications</p>
        ) : (
          <div className={styles.applicationList}>
            {pending.map((inst) => (
              <div key={inst.uid} className={`${s.card} ${styles.applicationCard}`}>
                <div className={styles.applicantInfo}>
                  <strong>{inst.displayName}</strong>
                  <span className={styles.meta}>{inst.email}</span>
                  <span className={styles.meta}>{inst.institution}</span>
                  <span className={styles.meta}>Applied {new Date(inst.appliedAt).toLocaleDateString()}</span>
                </div>
                <div className={styles.actions}>
                  <button className={s.btnSuccess} onClick={() => updateStatus(inst.uid, 'approved')} disabled={updatingUid === inst.uid}>Approve</button>
                  <button className={s.btnDanger} onClick={() => updateStatus(inst.uid, 'denied')} disabled={updatingUid === inst.uid}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
                <th>Sessions</th>
                <th>Players</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {others.map((inst) => (
                <tr key={inst.uid}>
                  <td>{inst.displayName}</td>
                  <td>{inst.email}</td>
                  <td>{inst.institution}</td>
                  <td>{inst.completedSessions ?? 0}</td>
                  <td>{inst.totalPlayers ?? 0}</td>
                  <td>{statusBadge(inst.status)}</td>
                  <td>
                    {inst.status === 'approved' && (
                      <button className={`${s.btnDanger} ${s.btnSmall}`} onClick={() => updateStatus(inst.uid, 'revoked')} disabled={updatingUid === inst.uid}>
                        Revoke
                      </button>
                    )}
                    {(inst.status === 'denied' || inst.status === 'revoked') && (
                      <button className={`${s.btnSuccess} ${s.btnSmall}`} onClick={() => updateStatus(inst.uid, 'approved')} disabled={updatingUid === inst.uid}>
                        Approve
                      </button>
                    )}
                    <button className={`${s.btnSecondary} ${s.btnSmall}`} onClick={() => resetPassword(inst.uid, inst.displayName)} disabled={updatingUid === inst.uid}>
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>Recent Sessions</h2>
          <button className={s.btnSecondary} onClick={() => { void fetchSessions(); }} disabled={refreshingSessions}>
            {refreshingSessions ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {sessionsError && <p className={s.error}>{sessionsError}</p>}
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
              {sessions.map((sess) => (
                <tr key={sess.id}>
                  <td>{sess.sessionName}</td>
                  <td><code>{sess.sessionCode}</code></td>
                  <td><span className={s.badge}>{sess.status}</span></td>
                  <td>{sess.playerCount}</td>
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
