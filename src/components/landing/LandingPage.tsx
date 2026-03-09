import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, ADMIN_EMAIL } from '../../firebase';
import s from '../../styles/shared.module.css';
import styles from './LandingPage.module.css';

type Tab = 'player' | 'login' | 'register';

export function LandingPage() {
  const { user, isAdmin, isInstructor, signIn, register, signOut, instructorStatus } = useAuth();
  const { setPlayerIdentity, session, sessionId } = useGame();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('player');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Player join
  const [sessionCode, setSessionCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regInstitution, setRegInstitution] = useState('');

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  // Redirect by rendering a route target instead of mutating navigation during render.
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
      const joinFn = httpsCallable<{ sessionCode: string; playerName: string }, { sessionId: string; playerId: string }>(functions, 'joinSession');
      const result = await joinFn({ sessionCode, playerName });
      setPlayerIdentity(result.data.sessionId, result.data.playerId);
      navigate('/game');
    } catch (joinErr) {
      // Try reconnect
      try {
        const reconnectFn = httpsCallable<{ sessionCode: string; playerName: string }, { sessionId: string; playerId: string }>(functions, 'reconnectPlayer');
        const result = await reconnectFn({ sessionCode, playerName });
        setPlayerIdentity(result.data.sessionId, result.data.playerId);
        navigate('/game');
      } catch (reconnectErr) {
        setError(getErrorMessage(reconnectErr, getErrorMessage(joinErr, 'Failed to join session')));
      }
    }
    setLoading(false);
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
        const instructorDoc = await getDoc(doc(db, 'instructors', signedInUser.uid));
        if (instructorDoc.exists() && instructorDoc.data().status === 'approved') {
          navigate('/instructor');
          return;
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
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
      setError(getErrorMessage(err, 'Registration failed'));
    }
    setLoading(false);
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
          <button
            className={`${styles.tab} ${tab === 'player' ? styles.tabActive : ''}`}
            onClick={() => { setTab('player'); setError(''); }}
          >
            Join Game
          </button>
          <button
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Instructor Login
          </button>
          <button
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
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
                  onChange={e => setSessionCode(e.target.value.toUpperCase())}
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
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              {error && <p className={s.error}>{error}</p>}
              <button type="submit" className={s.btnPrimary} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
                {loading ? 'Joining...' : 'Join Session'}
              </button>
            </form>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className={s.formGroup}>
                <label className={s.label}>Email</label>
                <input
                  className={s.input}
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Password</label>
                <input
                  className={s.input}
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                />
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
                <input
                  className={s.input}
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  required
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Institution</label>
                <input
                  className={s.input}
                  value={regInstitution}
                  onChange={e => setRegInstitution(e.target.value)}
                  placeholder="University or Organization"
                  required
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Email</label>
                <input
                  className={s.input}
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Password</label>
                <input
                  className={s.input}
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  minLength={6}
                  required
                />
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

      {user && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {dashboardPath && (
            <button
              className={s.btnPrimary}
              onClick={() => navigate(dashboardPath)}
              style={{ fontSize: '13px', marginRight: '8px' }}
            >
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
