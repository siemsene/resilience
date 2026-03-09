import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SessionList } from './SessionList';
import { CreateSession } from './CreateSession';
import { SessionView } from './SessionView';
import s from '../../styles/shared.module.css';
import styles from './InstructorPage.module.css';

type View = 'list' | 'create' | 'session';

export function InstructorPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const openSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setView('session');
  };

  const returnToSessionList = () => {
    setActiveSessionId(null);
    setView('list');
  };

  return (
    <div className={s.pageContainer}>
      <div className={styles.header}>
        <div>
          <h1 className={s.pageTitle} style={{ marginBottom: 0 }}>Instructor Dashboard</h1>
          {user && <span className={styles.email}>{user.email}</span>}
        </div>
        <div className={styles.headerActions}>
          {view !== 'list' && (
            <button className={s.btnSecondary} onClick={returnToSessionList}>
              Back to Sessions
            </button>
          )}
          {view === 'list' && (
            <button className={s.btnPrimary} onClick={() => setView('create')}>
              + New Session
            </button>
          )}
          <button className={s.btnSecondary} onClick={() => { signOut(); navigate('/'); }}>
            Sign Out
          </button>
        </div>
      </div>

      {view === 'list' && <SessionList onSelect={openSession} />}
      {view === 'create' && (
        <CreateSession
          onCreated={(id) => { openSession(id); }}
          onCancel={returnToSessionList}
        />
      )}
      {view === 'session' && activeSessionId && (
        <SessionView sessionId={activeSessionId} onDeleted={returnToSessionList} />
      )}
    </div>
  );
}
