import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import type { SessionDoc, SupplierKey, Country } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE, COUNTRY_LABELS } from '../../types';
import { calculateUnitCost } from '../../utils/pricing';
import s from '../../styles/shared.module.css';
import styles from './InitialSetup.module.css';

interface Props {
  session: SessionDoc;
  playerId: string;
  sessionId: string;
}

export function InitialSetup({ session, playerId, sessionId }: Props) {
  const [allocations, setAllocations] = useState<Record<SupplierKey, number>>(() => {
    const init: Record<string, number> = {};
    SUPPLIER_KEYS.forEach(key => { init[key] = 0; });
    return init as Record<SupplierKey, number>;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const total = SUPPLIER_KEYS.reduce((sum, key) => sum + (allocations[key] || 0), 0);
  const remaining = session.params.startingDemand - total;

  const calculateCost = () => {
    let cost = 0;
    for (const key of SUPPLIER_KEYS) {
      const amount = allocations[key] || 0;
      if (amount <= 0) continue;
      const country = SUPPLIER_COUNTRY[key];
      const transitTurns = session.params.transitTurns[country];
      const unitCost = calculateUnitCost(session.params, country, SUPPLIER_RELIABLE[key], amount);
      cost += amount * transitTurns * unitCost;
    }
    return cost;
  };

  const estimatedCost = calculateCost();
  const cashAfter = session.params.startingCash - estimatedCost;

  const handleSubmit = async () => {
    if (remaining !== 0) {
      setError(`Allocations must sum to ${session.params.startingDemand}. Remaining: ${remaining}`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const submitFn = httpsCallable(functions, 'submitInitialSetup');
      await submitFn({ sessionId, playerId, allocations });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit setup');
    }
    setLoading(false);
  };

  // Group by country
  const countries: Country[] = ['china', 'mexico', 'us'];

  return (
    <div className={styles.setupPage}>
      <div className={styles.setupContainer}>
        <h1 className={styles.title}>Initial Supply Chain Setup</h1>
        <p className={styles.subtitle}>
          Distribute <strong>{session.params.startingDemand.toLocaleString()}</strong> units among your suppliers.
          Each allocation fills all transit boxes for that route.
        </p>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Starting Cash</span>
            <span className={styles.statValue}>${session.params.startingCash.toLocaleString()}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Est. Setup Cost</span>
            <span className={`${styles.statValue} ${s.negative}`}>
              -${estimatedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Cash After</span>
            <span className={`${styles.statValue} ${cashAfter >= 0 ? s.positive : s.negative}`}>
              ${cashAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Remaining</span>
            <span className={`${styles.statValue} ${remaining === 0 ? s.positive : s.negative}`}>
              {remaining.toLocaleString()}
            </span>
          </div>
        </div>

        <div className={styles.supplierGrid}>
          {countries.map(country => (
            <div key={country} className={styles.countrySection} data-country={country}>
              <h3 className={styles.countryTitle}>
                {COUNTRY_LABELS[country]}
                <span className={styles.transitInfo}>
                  {session.params.transitTurns[country]} turn{session.params.transitTurns[country] > 1 ? 's' : ''} transit
                </span>
              </h3>
                <div className={styles.supplierPair}>
                  {SUPPLIER_KEYS.filter(k => SUPPLIER_COUNTRY[k] === country).map(key => {
                    const isReliable = SUPPLIER_RELIABLE[key];
                    const quantity = allocations[key] || 0;
                    const unitCost = calculateUnitCost(session.params, country, isReliable, quantity);
                    const lineCost = quantity * session.params.transitTurns[country] * unitCost;
                    return (
                      <div key={key} className={`${styles.supplierInput} ${isReliable ? styles.reliable : styles.unreliable}`}>
                        <div className={styles.supplierHeader}>
                          <span className={styles.supplierIcon}>{isReliable ? '\u{1F6E1}' : '\u26A0'}</span>
                          <span className={styles.supplierLabel}>
                            {isReliable ? 'Reliable' : 'Unreliable'}
                          </span>
                          <span className={styles.unitCost}>
                           ${unitCost.toFixed(2)}/unit
                          </span>
                        </div>
                        <input
                          type="number"
                        className={s.input}
                        value={allocations[key] || ''}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setAllocations(prev => ({ ...prev, [key]: Math.max(0, val) }));
                        }}
                          placeholder="0"
                          min={0}
                        />
                        <div className={styles.supplierMeta}>
                          <span>{quantity.toLocaleString()} units</span>
                          <span>${lineCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} route total</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
            </div>
          ))}
        </div>

        {error && <p className={`${s.error} ${s.mtMd}`}>{error}</p>}

        <button
          className={`${s.btnPrimary} ${s.btnLarge} ${styles.submitBtn}`}
          onClick={handleSubmit}
          disabled={loading || remaining !== 0}
        >
          {loading ? 'Submitting...' : remaining === 0 ? 'Confirm Setup' : `Distribute ${remaining} more units`}
        </button>
      </div>
    </div>
  );
}
