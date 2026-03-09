import type { SessionDoc } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './PlayerLobby.module.css';

interface Props {
  session: SessionDoc;
  playerId: string;
  onLeave: () => void;
}

export function PlayerLobby({ session, playerId, onLeave }: Props) {
  const players = Object.entries(session.players || {});

  return (
    <div className={styles.lobby}>
      <div className={styles.lobbyCard}>
        <h1 className={styles.title}>{session.sessionName}</h1>
        <p className={styles.subtitle}>Waiting for the instructor to start the game...</p>

        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>Session Code</span>
          <code className={styles.code}>{session.sessionCode}</code>
        </div>

        <div className={styles.playerSection}>
          <h3 className={styles.playerHeader}>
            Players ({players.length})
          </h3>
          <div className={styles.playerList}>
            {players.map(([pid, pinfo]) => (
              <div
                key={pid}
                className={`${styles.playerItem} ${pid === playerId ? styles.playerItemSelf : ''}`}
              >
                <span className={styles.dot} />
                <span>{pinfo.name}</span>
                {pid === playerId && <span className={styles.youBadge}>You</span>}
              </div>
            ))}
          </div>
        </div>

        <button className={`${s.btnSecondary} ${s.btnSmall}`} onClick={onLeave} style={{ marginTop: '16px' }}>
          Leave Session
        </button>
      </div>
    </div>
  );
}
