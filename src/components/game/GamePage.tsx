import { useGame } from '../../contexts/GameContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { PlayerLobby } from './PlayerLobby';
import { InitialSetup } from './InitialSetup';
import { PlayerGameView } from './PlayerGameView';
import s from '../../styles/shared.module.css';

export function GamePage() {
  const { session, playerState, sessionId, playerId, loading, clearPlayerIdentity } = useGame();
  const navigate = useNavigate();

  if (loading) {
    return <div className={s.loadingPage}><div className={s.spinner} /> Loading game...</div>;
  }

  if (!sessionId || !playerId) {
    return <Navigate to="/" replace />;
  }

  if (!session) {
    return <div className={s.loadingPage}><div className={s.spinner} /> Connecting to session...</div>;
  }

  // Completed -> results
  if (session.status === 'completed') {
    return <Navigate to={`/results/${sessionId}`} replace />;
  }

  // Lobby
  if (session.status === 'lobby') {
    return <PlayerLobby session={session} playerId={playerId} onLeave={() => { clearPlayerIdentity(); navigate('/'); }} />;
  }

  // Setup
  if (session.status === 'setup' && !playerState) {
    return (
      <InitialSetup
        session={session}
        playerId={playerId}
        sessionId={sessionId}
      />
    );
  }

  // Setup submitted, waiting
  if (session.status === 'setup' && playerState) {
    return (
      <div className={s.loadingPage}>
        <div style={{ textAlign: 'center' }}>
          <div className={s.spinner} style={{ marginBottom: '16px' }} />
          <h2>Setup Complete</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Waiting for other players to finish their setup...
          </p>
          <p style={{ color: 'var(--text-light)', marginTop: '4px', fontSize: '14px' }}>
            {session.submittedPlayers?.length || 0} / {Object.keys(session.players).length} ready
          </p>
        </div>
      </div>
    );
  }

  // Active game
  if (session.status === 'active' && playerState) {
    return (
      <PlayerGameView
        session={session}
        playerState={playerState}
        playerId={playerId}
        sessionId={sessionId}
      />
    );
  }

  return <div className={s.loadingPage}><div className={s.spinner} /> Loading...</div>;
}
