import styles from './RoundHeader.module.css';

interface Props {
  round: number;
  totalRounds: number;
  cash: number;
  inventory: number;
  marketDemand: number;
  phase: string;
}

export function RoundHeader({ round, totalRounds, cash, inventory, marketDemand, phase }: Props) {
  const phaseLabel = phase === 'ordering' ? 'Place Orders'
    : phase === 'processing' ? 'Processing...'
    : phase === 'waiting' ? 'Waiting...'
    : phase === 'results' ? 'Round Results'
    : phase;

  return (
    <div className={styles.header}>
      <div className={styles.roundInfo}>
        <span className={styles.roundLabel}>Round</span>
        <span className={styles.roundNumber}>{round}</span>
        <span className={styles.roundTotal}>/ {totalRounds}</span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Cash</span>
          <span className={`${styles.statValue} ${cash < 0 ? styles.negative : ''}`}>
            ${cash.toLocaleString()}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Inventory</span>
          <span className={styles.statValue}>{inventory.toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Demand</span>
          <span className={styles.statValue}>{marketDemand.toLocaleString()}</span>
        </div>
      </div>

      <div className={styles.phase}>
        <span className={styles.phaseLabel}>{phaseLabel}</span>
      </div>
    </div>
  );
}
