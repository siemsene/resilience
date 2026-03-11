import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, ADMIN_EMAIL, ensurePlayerAuth } from '../../firebase';
import s from '../../styles/shared.module.css';
import styles from './LandingPage.module.css';

type Tab = 'player' | 'login' | 'register';

function getCallableErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function getCallableErrorCode(err: unknown) {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
    ? err.code
    : null;
}

function isDuplicatePlayerNameError(err: unknown) {
  const code = getCallableErrorCode(err);
  const message = getCallableErrorMessage(err, '').toLowerCase();
  return code === 'functions/already-exists' || message.includes('already exists');
}

function isLateJoinReconnectError(err: unknown) {
  const code = getCallableErrorCode(err);
  const message = getCallableErrorMessage(err, '').toLowerCase();
  return code === 'functions/failed-precondition' && message.includes('only existing players can reconnect');
}

function isExpiredSessionError(err: unknown) {
  const code = getCallableErrorCode(err);
  const message = getCallableErrorMessage(err, '').toLowerCase();
  return code === 'functions/failed-precondition' && message.includes('expired');
}

function formatJoinError(err: unknown) {
  const joinMessage = getCallableErrorMessage(err, 'Failed to join session.');

  if (isDuplicatePlayerNameError(err)) {
    return 'That name is already in use in this lobby. Pick a different player name.';
  }
  if (joinMessage.toLowerCase().includes('no session found')) {
    return 'No session matches that code. Check the six-character code and try again.';
  }
  if (isLateJoinReconnectError(err)) {
    return 'This session has already started. Enter the exact same player name you used before to reconnect.';
  }
  if (isExpiredSessionError(err)) {
    return 'This session has expired and is no longer available.';
  }
  return joinMessage;
}

export function LandingPage() {
  const { user, isAdmin, isInstructor, signIn, register, signOut, instructorStatus } = useAuth();
  const { setPlayerIdentity, session, sessionId } = useGame();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('player');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [sessionCode, setSessionCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regInstitution, setRegInstitution] = useState('');

  if (session && sessionId) {
    return <Navigate to="/game" replace />;
  }

  const dashboardPath = isAdmin ? '/admin' : isInstructor ? '/instructor' : null;
  const dashboardLabel = isAdmin ? 'Open Admin Dashboard' : 'Open Instructor Dashboard';

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ensurePlayerAuth();
      const joinFn = httpsCallable<
        { sessionCode: string; playerName: string },
        { sessionId: string; playerId: string; action: 'joined' | 'reconnected' }
      >(functions, 'joinSession');
      const result = await joinFn({ sessionCode, playerName });
      setPlayerIdentity(result.data.sessionId, result.data.playerId);
      navigate('/game');
    } catch (err) {
      setError(formatJoinError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      const normalizedEmail = loginEmail.trim().toLowerCase();

      if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
        navigate('/admin');
        return;
      }

      const signedInUser = auth.currentUser;
      if (signedInUser) {
        const tokenResult = await signedInUser.getIdTokenResult(true);
        if (tokenResult.claims.role === 'instructor') {
          navigate('/instructor');
          return;
        }
      }
    } catch (err) {
      setError(getCallableErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(regEmail, regPassword, regName, regInstitution);
    } catch (err) {
      setError(getCallableErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.landing}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Supply Chain Resilience</h1>
        <p className={styles.subtitle}>
          Navigate global supply chains, manage disruptions, and outperform your competitors
        </p>
      </div>

      <div className={styles.formContainer}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'player' ? styles.tabActive : ''}`} onClick={() => { setTab('player'); setError(''); }}>
            Join Game
          </button>
          <button className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            Instructor Login
          </button>
          <button className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            Register
          </button>
        </div>

        <div className={s.card}>
          {tab === 'player' && (
            <form onSubmit={handleJoin}>
              <div className={s.formGroup}>
                <label className={s.label}>Session Code</label>
                <input
                  className={s.input}
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-character code"
                  maxLength={6}
                  required
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Your Name</label>
                <input
                  className={s.input}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              <p style={{ color: 'var(--text-light)', fontSize: 13, margin: '0 0 8px' }}>
                Use the same session code and player name to reconnect after the game starts. Before the game starts, each player name must be unique.
              </p>
              <p style={{ color: 'var(--text-light)', fontSize: 13, margin: '0 0 8px' }}>
                Each browser tab keeps its own player sign-in, so you can test multiple students in parallel from one browser.
              </p>
              {error && <p className={s.error}>{error}</p>}
              <button type="submit" className={s.btnPrimary} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                {loading ? 'Joining or reconnecting...' : 'Join or Reconnect'}
              </button>
            </form>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className={s.formGroup}>
                <label className={s.label}>Email</label>
                <input className={s.input} type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Password</label>
                <input className={s.input} type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
              </div>
              {error && <p className={s.error}>{error}</p>}
              <button type="submit" className={s.btnPrimary} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              {user && instructorStatus === 'pending' && (
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '14px' }}>
                  Your application is pending review.
                </p>
              )}
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister}>
              <div className={s.formGroup}>
                <label className={s.label}>Full Name</label>
                <input className={s.input} value={regName} onChange={(e) => setRegName(e.target.value)} required />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Institution</label>
                <input className={s.input} value={regInstitution} onChange={(e) => setRegInstitution(e.target.value)} placeholder="University or Organization" required />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Email</label>
                <input className={s.input} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Password</label>
                <input className={s.input} type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} minLength={6} required />
              </div>
              {error && <p className={s.error}>{error}</p>}
              <button type="submit" className={s.btnPrimary} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                {loading ? 'Registering...' : 'Apply as Instructor'}
              </button>
              <p style={{ marginTop: '12px', color: 'var(--text-light)', fontSize: '13px', textAlign: 'center' }}>
                Applications are reviewed by an administrator.
              </p>
            </form>
          )}
        </div>
      </div>

      {user && !user.isAnonymous && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {dashboardPath && (
            <button className={s.btnPrimary} onClick={() => navigate(dashboardPath)} style={{ fontSize: '13px', marginRight: '8px' }}>
              {dashboardLabel}
            </button>
          )}
          <button className={s.btnSecondary} onClick={signOut} style={{ fontSize: '13px' }}>
            Sign Out ({user.email})
          </button>
        </div>
      )}
    </div>
  );
}
