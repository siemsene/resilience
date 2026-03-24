import type { ReactNode } from 'react';
import { useGame } from '../../contexts/GameContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { PlayerLobby } from './PlayerLobby';
import { InitialSetup } from './InitialSetup';
import { PlayerGameView } from './PlayerGameView';
import s from '../../styles/shared.module.css';
import styles from './GamePage.module.css';

export function GamePage() {
  const { session, playerState, playerName, sessionId, playerId, isOffline, loading, clearPlayerIdentity } = useGame();
  const navigate = useNavigate();

  const renderPlayerShell = (content: ReactNode) => (
    <>
      {isOffline && (
        <div className={s.pageContainer}>
          <div className={`${s.card} ${s.cardWarning} ${s.mbMd}`}>
            <strong>Connection lost.</strong> Your game will reconnect automatically when internet access returns. Keep this tab open and re-enter the same session code and player name if you need to reconnect from a fresh sign-in.
          </div>
        </div>
      )}
      {content}
    </>
  );

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
    return renderPlayerShell(
      <PlayerLobby session={session} playerId={playerId} playerName={playerName} onLeave={() => { clearPlayerIdentity(); navigate('/'); }} />
    );
  }

  // Setup
  if (session.status === 'setup' && !playerState) {
    return renderPlayerShell(
      <InitialSetup
        session={session}
        playerId={playerId}
        sessionId={sessionId}
      />
    );
  }

  // Setup submitted, waiting
  if (session.status === 'setup' && playerState) {
    return renderPlayerShell(
      <div className={s.loadingPage}>
        <div className={styles.setupWaiting}>
          <div className={`${s.spinner} ${styles.setupWaitingSpinner}`} />
          <h2>Setup Complete</h2>
          <p className={styles.setupWaitingNote}>
            Waiting for other players to finish their setup...
          </p>
          <p className={styles.setupWaitingCount}>
            {session.submittedCount} / {session.playerCount} ready
          </p>
        </div>
      </div>
    );
  }

  // Active game
  if (session.status === 'active' && playerState) {
    return renderPlayerShell(
      <PlayerGameView
        session={session}
        playerState={playerState}
        playerId={playerId}
        sessionId={sessionId}
      />
    );
  }

  return renderPlayerShell(<div className={s.loadingPage}><div className={s.spinner} /> Loading...</div>);
}

