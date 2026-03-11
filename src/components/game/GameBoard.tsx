import type { SessionDoc, PlayerStateDoc, SupplierKey, Country, OrderMap } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE, COUNTRY_LABELS } from '../../types';
import { getCurrentSupplierMaxOrder } from '../../utils/orderLimits';
import { calculateUnitCost } from '../../utils/pricing';
import styles from './GameBoard.module.css';

interface Props {
  session: SessionDoc;
  playerState: PlayerStateDoc;
  orders: OrderMap;
  orderInputs: Record<SupplierKey, string>;
  onOrderChange: (key: SupplierKey, value: string) => void;
  disabled: boolean;
  submitControls?: React.ReactNode;
  validationWarnings?: string[];
}

export function GameBoard({
  session,
  playerState,
  orders,
  orderInputs,
  onOrderChange,
  disabled,
  submitControls,
  validationWarnings = [],
}: Props) {
  const countries: Country[] = ['china', 'mexico', 'us'];
  const chinaTransit = playerState.transit.china || [];
  const mexicoTransit = playerState.transit.mexico || [];
  const usTransit = playerState.transit.us || [];
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isDisrupted = (country: Country) => !!session.activeDisruptions[country];

  const getMaxOrder = (key: SupplierKey): number | null => {
    const supplierState = playerState.suppliers?.[key];
    return getCurrentSupplierMaxOrder(supplierState, session.params);
  };

  const renderSupplierCard = (key: SupplierKey, disrupted: boolean) => {
    const isReliable = SUPPLIER_RELIABLE[key];
    const supplierState = playerState.suppliers?.[key];
    const maxOrder = getMaxOrder(key);

    return (
      <div key={key} className={`${styles.supplierBox} ${isReliable ? styles.reliable : styles.unreliable}`}>
        <div className={styles.supplierLabel}>
          <span>{isReliable ? '\u{1F6E1}' : '\u26A0'}</span>
          <span>{isReliable ? 'Reliable' : 'Unreliable'}</span>
        </div>
        <div className={styles.orderEntryRow}>
          <input
            type="number"
            className={styles.orderInput}
            value={orderInputs[key] || ''}
            onChange={e => onOrderChange(key, e.target.value)}
            placeholder="0"
            min={0}
            max={maxOrder || undefined}
            step={1}
            disabled={disabled || disrupted}
          />
          <button
            type="button"
            className={styles.maxOrderBtn}
            onClick={() => onOrderChange(key, String(maxOrder || 0))}
            disabled={disabled || disrupted || !maxOrder}
          >
            Max
          </button>
        </div>
        {supplierState?.active && (
          <span className={styles.lastOrder}>
            Last: {supplierState.lastOrder} | Max: {maxOrder}
          </span>
        )}
        {!supplierState?.active && !disrupted && (
          <span className={styles.lastOrder}>New (max {maxOrder})</span>
        )}
      </div>
    );
  };

  const orderPlan = SUPPLIER_KEYS
    .map(key => {
      const quantity = orders[key] || 0;
      if (quantity <= 0) {
        return null;
      }

      const country = SUPPLIER_COUNTRY[key];
      const isReliable = SUPPLIER_RELIABLE[key];
      const unitPrice = calculateUnitCost(session.params, country, isReliable, quantity);
      return {
        key,
        label: `${COUNTRY_LABELS[country]} ${isReliable ? 'Reliable' : 'Unreliable'}`,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
      };
    })
    .filter((line): line is NonNullable<typeof line> => !!line);
  const orderPlanQuantity = orderPlan.reduce((sum, line) => sum + line.quantity, 0);
  const orderPlanTotal = orderPlan.reduce((sum, line) => sum + line.lineTotal, 0);
  const orderPlanAverageUnitPrice = orderPlanQuantity > 0 ? orderPlanTotal / orderPlanQuantity : 0;
  const requestedOrdersByCountry = {
    us: SUPPLIER_KEYS
      .filter((key) => SUPPLIER_COUNTRY[key] === 'us')
      .reduce((sum, key) => sum + (orders[key] || 0), 0),
    mexico: SUPPLIER_KEYS
      .filter((key) => SUPPLIER_COUNTRY[key] === 'mexico')
      .reduce((sum, key) => sum + (orders[key] || 0), 0),
  };
  const pipelineForecast = Array.from({ length: 4 }, (_, index) => ({
    round: session.currentRound + index + 1,
    units: [chinaTransit, mexicoTransit, usTransit]
      .reduce((sum, transit) => sum + (transit[transit.length - 1 - index] || 0), 0),
  })).reverse();
  const requestedPipelinePlan = pipelineForecast.map((entry) => {
    if (entry.round === session.currentRound + 3) {
      return { ...entry, label: 'Req MX', units: requestedOrdersByCountry.mexico, tone: 'mexico' as const };
    }
    if (entry.round === session.currentRound + 2) {
      return { ...entry, label: 'Req US', units: requestedOrdersByCountry.us, tone: 'us' as const };
    }
    return { ...entry, label: '', units: 0, tone: 'empty' as const };
  });
  const projectedBalancePlan = pipelineForecast.map((entry, index) => {
    const projectedUnits = entry.units + requestedPipelinePlan[index].units;
    const balance = projectedUnits - playerState.marketDemand;
    return {
      round: entry.round,
      balance,
      tone: balance > 0 ? 'surplus' as const : balance < 0 ? 'shortfall' as const : 'balanced' as const,
    };
  });
  const renderDisruptionOverlay = (country: Country) => (
    <div className={styles.disruptedOverlay}>
      <span className={styles.disruptedLabel}>Disrupted</span>
      <span className={styles.disruptedSubtext}>{COUNTRY_LABELS[country]} supply offline</span>
    </div>
  );

  return (
    <div className={styles.board}>
      {/* Left: Source countries */}
      <div className={styles.sourceColumn}>
        {countries.filter(c => c !== 'us').map(country => {
          const disrupted = isDisrupted(country);
          const suppliers = SUPPLIER_KEYS.filter(k => SUPPLIER_COUNTRY[k] === country);

          return (
            <div
              key={country}
              className={`${styles.countryCard} ${disrupted ? styles.disrupted : ''}`}
              data-country={country}
            >
              {disrupted && renderDisruptionOverlay(country)}
              <h3 className={styles.countryName}>{COUNTRY_LABELS[country]}</h3>

              <div className={styles.supplierList}>
                {suppliers.map(key => {
                  return renderSupplierCard(key, disrupted);
                })}
              </div>
            </div>
          );
        })}

        {submitControls && (
          <div className={styles.sourceActions}>
            {submitControls}
          </div>
        )}
      </div>

      {/* Center: Transit pipelines */}
      <div className={styles.transitColumn}>
        {/* China transit */}
        <div className={`${styles.transitPipeline} ${styles.chinaTransitPipeline}`}>
          <span className={styles.transitLabel}>China Transit ({session.params.transitTurns.china} turns)</span>
          <div className={`${styles.transitBoxes} ${chinaTransit.length > 1 ? styles.transitBoxesSpread : ''}`}>
            {chinaTransit.flatMap((units, i) => {
              const nodes = [
                <div key={`ch-box-${i}`} className={`${styles.transitBox} ${units > 0 ? styles.transitBoxFull : ''}`}>
                  <span className={styles.transitUnits}>{units > 0 ? units : ''}</span>
                </div>,
              ];
              if (i < chinaTransit.length - 1) {
                nodes.push(
                  <span key={`ch-arrow-${i}`} className={styles.transitArrowSlot}>
                    <span className={styles.transitArrow}>{'\u2192'}</span>
                  </span>
                );
              }
              return nodes;
            })}
          </div>
        </div>

        {/* Mexico transit */}
        <div className={`${styles.transitPipeline} ${styles.mexicoTransitPipeline}`}>
          <span className={styles.transitLabel}>Mexico Transit ({session.params.transitTurns.mexico} turns)</span>
          <div className={`${styles.transitBoxes} ${mexicoTransit.length > 1 ? styles.transitBoxesSpread : ''}`}>
            {mexicoTransit.flatMap((units, i) => {
              const nodes = [
                <div key={`mx-box-${i}`} className={`${styles.transitBox} ${units > 0 ? styles.transitBoxFull : ''}`}>
                  <span className={styles.transitUnits}>{units > 0 ? units : ''}</span>
                </div>,
              ];
              if (i < mexicoTransit.length - 1) {
                nodes.push(
                  <span key={`mx-arrow-${i}`} className={styles.transitArrowSlot}>
                    <span className={styles.transitArrow}>{'\u2192'}</span>
                  </span>
                );
              }
              return nodes;
            })}
          </div>
        </div>

        <div className={`${styles.infoBox} ${styles.planBox} ${styles.centerPlanBox}`}>
          <div className={styles.planHeader}>
            <div>
              <div className={styles.infoLabel}>Requested Order Plan</div>
              <div className={styles.planMetrics}>
                <span>Total Qty {orderPlanQuantity.toLocaleString()}</span>
                <span>Avg Unit {currencyFormatter.format(orderPlanAverageUnitPrice)}</span>
              </div>
            </div>
            <div className={styles.planTotal}>{currencyFormatter.format(orderPlanTotal)}</div>
          </div>

          {orderPlan.length > 0 ? (
            <div className={styles.planTable}>
              <div className={styles.planTableHead}>
                <span>Supplier</span>
                <span>Qty</span>
                <span>Unit</span>
                <span>Line</span>
              </div>
              {orderPlan.map(line => (
                <div key={line.key} className={styles.planRow}>
                  <span className={styles.planSupplier}>{line.label}</span>
                  <span>{line.quantity.toLocaleString()}</span>
                  <span>{currencyFormatter.format(line.unitPrice)}</span>
                  <span>{currencyFormatter.format(line.lineTotal)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.planEmpty}>Enter an order to build the current request estimate.</p>
          )}
        </div>
      </div>

      {/* Right: US destination */}
      <div className={styles.destColumn}>
        {/* US suppliers */}
        <div className={`${styles.countryCard} ${isDisrupted('us') ? styles.disrupted : ''}`} data-country="us">
          {isDisrupted('us') && renderDisruptionOverlay('us')}
          <h3 className={styles.countryName}>{COUNTRY_LABELS.us}</h3>
          <div className={styles.supplierList}>
            {SUPPLIER_KEYS.filter(k => SUPPLIER_COUNTRY[k] === 'us').map(key => {
              return renderSupplierCard(key, isDisrupted('us'));
            })}
          </div>
        </div>

        <div className={`${styles.transitPipeline} ${styles.usTransitPipeline} ${styles.destTransitPipeline}`}>
          <span className={styles.transitLabel}>US Transit ({session.params.transitTurns.us} turn)</span>
          <div className={styles.transitBoxes}>
            {usTransit.flatMap((units, i) => {
              const nodes = [
                <div key={`us-box-${i}`} className={`${styles.transitBox} ${units > 0 ? styles.transitBoxFull : ''}`}>
                  <span className={styles.transitUnits}>{units > 0 ? units : ''}</span>
                </div>,
              ];
              if (i < usTransit.length - 1) {
                nodes.push(
                  <span key={`us-arrow-${i}`} className={styles.transitArrowSlot}>
                    <span className={styles.transitArrow}>{'\u2192'}</span>
                  </span>
                );
              }
              return nodes;
            })}
          </div>
        </div>

        <div className={`${styles.infoBox} ${styles.pipelineSummaryBox}`}>
          <div className={styles.infoLabel}>Order Pipeline</div>
          <div className={styles.pipelineSummaryGrid}>
            {pipelineForecast.map((entry) => (
              <div key={entry.round} className={styles.pipelineSummaryItem}>
                <span className={styles.pipelineSummaryLabel}>Round {entry.round}</span>
                <span className={styles.pipelineSummaryValue}>{entry.units.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className={styles.pipelineRequestGrid}>
            {requestedPipelinePlan.map((entry) => (
              <div
                key={`req-${entry.round}`}
                className={`${styles.pipelineRequestItem} ${
                  entry.tone === 'us'
                    ? styles.pipelineRequestUs
                    : entry.tone === 'mexico'
                      ? styles.pipelineRequestMexico
                      : styles.pipelineRequestEmpty
                }`}
              >
                {entry.label && <span className={styles.pipelineRequestLabel}>{entry.label}</span>}
                <span className={styles.pipelineRequestValue}>{entry.units > 0 ? entry.units.toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
          <div className={styles.pipelineBalanceGrid}>
            {projectedBalancePlan.map((entry) => (
              <div
                key={`bal-${entry.round}`}
                className={`${styles.pipelineBalanceItem} ${
                  entry.tone === 'surplus'
                    ? styles.pipelineBalanceSurplus
                    : entry.tone === 'shortfall'
                      ? styles.pipelineBalanceShortfall
                      : styles.pipelineBalanceNeutral
                }`}
              >
                <span className={styles.pipelineBalanceLabel}>Proj +/-</span>
                <span className={styles.pipelineBalanceValue}>
                  {entry.balance > 0 ? '+' : ''}{entry.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.infoRow}>
          <div className={`${styles.infoBox} ${styles.infoCompact}`}>
            <div className={styles.infoLabel}>Inventory</div>
            <div className={styles.infoValue}>{playerState.inventory.toLocaleString()}</div>
          </div>

          <div className={`${styles.infoBox} ${styles.infoCompact}`}>
            <div className={styles.infoLabel}>Market Demand</div>
            <div className={styles.infoValue}>{playerState.marketDemand.toLocaleString()}</div>
          </div>
        </div>

        {validationWarnings.length > 0 && (
          <div className={`${styles.infoBox} ${styles.warningPanel}`}>
            <div className={styles.warningHeader}>Order Warnings</div>
            <ul className={styles.warningList}>
              {validationWarnings.map(warning => (
                <li key={warning} className={styles.warningItem}>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
