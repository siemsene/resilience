import type { RoundHistoryEntry } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from '../../types';
import styles from './RoundResultsOverlay.module.css';

interface Props {
  round: RoundHistoryEntry;
  onConfirm: () => void;
  confirming: boolean;
  confirmedCount: number;
  playerCount: number;
}

export function RoundResultsOverlay({ round, onConfirm, confirming, confirmedCount, playerCount }: Props) {
  const profit = round.revenue - round.orderCosts - round.holdingCosts;
  const hadCapacityRationing = SUPPLIER_KEYS.some((key) => round.capacityLimited?.[key]);

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.title}>Round {round.round} Results</h2>

        <div className={styles.grid}>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Arrivals</h4>
            <div className={styles.bigNumber}>{round.arrivals.toLocaleString()}</div>
            <span className={styles.label}>units arrived</span>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Orders</h4>
            {SUPPLIER_KEYS.filter(k => round.orders[k] > 0).map(key => (
              <div key={key} className={styles.orderRow}>
                <div className={styles.orderSummary}>
                  <span className={styles.supplierName}>{SUPPLIER_LABELS[key]}</span>
                  <div className={styles.orderValues}>
                    <span>Ordered <strong>{round.orders[key].toLocaleString()}</strong></span>
                    <span>Delivered <strong>{round.allocated[key].toLocaleString()}</strong></span>
                  </div>
                </div>
                <span className={styles.orderStatus}>
                  {round.cancelled[key] ? (
                    <span className={styles.cancelled}>Cancelled</span>
                  ) : round.capacityLimited?.[key] ? (
                    <span className={styles.partial}>Capacity shortage</span>
                  ) : round.allocated[key] < round.orders[key] ? (
                    <span className={styles.partial}>Partial delivery</span>
                  ) : (
                    <span className={styles.fulfilled}>Delivered in full</span>
                  )}
                </span>
              </div>
            ))}
            {SUPPLIER_KEYS.every(k => round.orders[k] === 0) && (
              <span className={styles.label}>No orders placed</span>
            )}
            {hadCapacityRationing && (
              <p className={styles.capacityNotice}>
                Some shipments were rationed because supplier orders exceeded hidden supplier capacity.
              </p>
            )}
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Demand</h4>
            <div className={styles.demandRow}>
              <span>Demand:</span>
              <strong>{round.demand.toLocaleString()}</strong>
            </div>
            <div className={styles.demandRow}>
              <span>Sold:</span>
              <strong className={styles.fulfilled}>{round.sold.toLocaleString()}</strong>
            </div>
            {round.unmetDemand > 0 && (
              <div className={styles.demandRow}>
                <span>Unmet:</span>
                <strong className={styles.cancelled}>{round.unmetDemand.toLocaleString()}</strong>
              </div>
            )}
            {round.extraDemandGained > 0 && (
              <div className={styles.demandRow}>
                <span>Extra gained:</span>
                <strong className={styles.fulfilled}>+{round.extraDemandGained.toLocaleString()}</strong>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Financials</h4>
            <div className={styles.demandRow}>
              <span>Revenue:</span>
              <strong className={styles.fulfilled}>+${round.revenue.toLocaleString()}</strong>
            </div>
            <div className={styles.demandRow}>
              <span>Order costs:</span>
              <strong className={styles.cancelled}>-${round.orderCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            </div>
            <div className={styles.demandRow}>
              <span>Holding costs:</span>
              <strong className={styles.cancelled}>-${round.holdingCosts.toLocaleString()}</strong>
            </div>
            <div className={`${styles.demandRow} ${styles.profitRow}`}>
              <span>Profit:</span>
              <strong style={{ color: profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {profit >= 0 ? '+' : ''}${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </strong>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <span>Cash: <strong>${round.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
          <span>Inventory: <strong>{round.inventory.toLocaleString()}</strong></span>
          <span>Demand: <strong>{round.marketDemand.toLocaleString()}</strong></span>
        </div>
        <p className={styles.confirmationHint}>
          {confirmedCount.toLocaleString()} / {playerCount.toLocaleString()} players confirmed this summary.
        </p>

        <button className={styles.dismiss} onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Confirming...' : 'Confirm and Continue'}
        </button>
      </div>
    </div>
  );
}
