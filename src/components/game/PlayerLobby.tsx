import type { SessionDoc } from '../../types';
import s from '../../styles/shared.module.css';
import styles from './PlayerLobby.module.css';
import { downloadPlayerGuide } from '../../utils/playerGuide';

interface Props {
  session: SessionDoc;
  playerId: string;
  playerName: string | null;
  onLeave: () => void;
}

export function PlayerLobby({ session, playerId, playerName, onLeave }: Props) {
  const displayName = playerName?.trim() || playerId.slice(0, 6);

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
          <h3 className={styles.playerHeader}>Players Connected</h3>
          <div className={styles.playerList}>
            <div className={`${styles.playerItem} ${styles.playerItemSelf}`}>
              <span className={styles.dot} />
              <span>This tab is connected as player <code>{displayName}</code></span>
              <span className={styles.youBadge}>You</span>
            </div>
            <div className={styles.playerItem}>
              <span className={styles.dot} />
              <span>{session.playerCount} player{session.playerCount === 1 ? '' : 's'} currently joined</span>
            </div>
          </div>
        </div>

        <button className={`${s.btnSecondary} ${s.btnSmall} ${s.mtMd}`} onClick={downloadPlayerGuide}>
          Download Player Guide
        </button>
        <button className={`${s.btnSecondary} ${s.btnSmall} ${s.mtSm}`} onClick={onLeave}>
          Leave Session
        </button>
      </div>
    </div>
  );
}
