import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { DEFAULT_PARAMS, type SessionParams, type Country, type DisruptionSchedule } from '../../types';
import { generateDisruptionSchedule } from '../../utils/disruptions';
import { DisruptionScheduler } from './DisruptionScheduler';
import s from '../../styles/shared.module.css';
import styles from './CreateSession.module.css';

interface Props {
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

export function CreateSession({ onCreated, onCancel }: Props) {
  const [sessionName, setSessionName] = useState('');
  const [params, setParams] = useState<SessionParams>({ ...DEFAULT_PARAMS });
  const [schedule, setSchedule] = useState<DisruptionSchedule>(() =>
    generateDisruptionSchedule(DEFAULT_PARAMS.totalRounds, DEFAULT_PARAMS.disruptionsPerCountry, DEFAULT_PARAMS.disruptionDuration)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = <K extends keyof SessionParams>(key: K, value: SessionParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateCapacityTargetWeight = (targetWeight: number) => {
    const nextTargetWeight = Math.min(1, Math.max(0, targetWeight));
    setParams((prev) => ({
      ...prev,
      supplierCapacityTargetWeight: nextTargetWeight,
      supplierCapacityPriorWeight: 1 - nextTargetWeight,
    }));
  };

  const regenerateSchedule = () => {
    setSchedule(generateDisruptionSchedule(params.totalRounds, params.disruptionsPerCountry, params.disruptionDuration));
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) {
      return;
    }

    setError('');
    setLoading(true);
    try {
      const createSession = httpsCallable<
        { sessionName: string; params: SessionParams; disruptionSchedule: DisruptionSchedule },
        { sessionId: string; sessionCode: string }
      >(functions, 'createSession');
      const result = await createSession({
        sessionName: sessionName.trim(),
        params,
        disruptionSchedule: schedule,
      });
      onCreated(result.data.sessionId);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreate}>
      <h2 className={s.mbLg}>Create New Session</h2>

      <div className={`${s.card} ${s.mbLg}`}>
        <div className={s.formGroup}>
          <label className={s.label} htmlFor="session-name">Session Name</label>
          <input
            id="session-name"
            className={s.input}
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g., SCM 301 - Spring 2026"
            required
          />
        </div>

        <div className={styles.paramGrid}>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="total-rounds">Total Rounds</label>
            <input id="total-rounds" className={s.input} type="number" value={params.totalRounds} onChange={(e) => updateParam('totalRounds', parseInt(e.target.value) || 30)} min={5} max={100} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="starting-cash">Starting Cash ($)</label>
            <input id="starting-cash" className={s.input} type="number" value={params.startingCash} onChange={(e) => updateParam('startingCash', parseInt(e.target.value) || 0)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="starting-demand">Starting Demand</label>
            <input id="starting-demand" className={s.input} type="number" value={params.startingDemand} onChange={(e) => updateParam('startingDemand', parseInt(e.target.value) || 0)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="selling-price">Selling Price ($)</label>
            <input id="selling-price" className={s.input} type="number" value={params.sellingPrice} onChange={(e) => updateParam('sellingPrice', parseInt(e.target.value) || 0)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="holding-cost">Holding Cost / Unit ($)</label>
            <input id="holding-cost" className={s.input} type="number" value={params.holdingCostPerUnit} onChange={(e) => updateParam('holdingCostPerUnit', parseFloat(e.target.value) || 0)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="loyalty-pct">Loyalty %</label>
            <input id="loyalty-pct" className={s.input} type="number" value={params.loyaltyPercent * 100} onChange={(e) => updateParam('loyaltyPercent', (parseFloat(e.target.value) || 0) / 100)} min={0} max={100} step={5} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="round-timer">Round Time Limit (sec)</label>
            <input id="round-timer" className={s.input} type="number" value={params.roundTimeLimit} onChange={(e) => updateParam('roundTimeLimit', parseInt(e.target.value) || 120)} min={30} max={600} step={30} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="disruption-bonus">Disruption Bonus Time (sec)</label>
            <input id="disruption-bonus" className={s.input} type="number" value={params.disruptionBonusTime} onChange={(e) => updateParam('disruptionBonusTime', parseInt(e.target.value) || 0)} min={0} max={300} step={15} />
          </div>
        </div>
      </div>

      <div className={`${s.card} ${s.mbLg}`}>
        <h3 className={s.mbMd}>Supplier Base Costs</h3>
        <div className={styles.paramGrid}>
          {(['china', 'mexico', 'us'] as Country[]).map((country) => (
            <div key={country} className={s.formGroup}>
              <label className={s.label} htmlFor={`base-cost-${country}`}>{country === 'us' ? 'US' : country.charAt(0).toUpperCase() + country.slice(1)} Base Cost ($)</label>
              <input id={`base-cost-${country}`} className={s.input} type="number" value={params.baseCost[country]} onChange={(e) => updateParam('baseCost', { ...params.baseCost, [country]: parseFloat(e.target.value) || 0 })} />
            </div>
          ))}
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="unreliable-cost">Unreliable Cost Modifier</label>
            <input id="unreliable-cost" className={s.input} type="number" value={params.unreliableCostModifier} onChange={(e) => updateParam('unreliableCostModifier', parseFloat(e.target.value) || 0)} step={0.05} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="unreliable-cancel">Unreliable Cancel Chance</label>
            <input id="unreliable-cancel" className={s.input} type="number" value={params.unreliableCancellationChance * 100} onChange={(e) => updateParam('unreliableCancellationChance', (parseFloat(e.target.value) || 0) / 100)} min={0} max={100} step={5} />
          </div>
        </div>
      </div>

      <div className={`${s.card} ${s.mbLg}`}>
        <div className={styles.sectionHeader}>
          <h3>Disruption Schedule</h3>
          <button type="button" className={`${s.btnSecondary} ${s.btnSmall}`} onClick={regenerateSchedule}>
            Randomize
          </button>
        </div>
        <div className={`${styles.paramGrid} ${s.mbMd}`}>
          {(['china', 'mexico', 'us'] as Country[]).map((country) => (
            <div key={country} className={s.formGroup}>
              <label className={s.label} htmlFor={`disruptions-${country}`}>{country === 'us' ? 'US' : country.charAt(0).toUpperCase() + country.slice(1)} Disruptions</label>
              <input
                id={`disruptions-${country}`}
                className={s.input}
                type="number"
                value={params.disruptionsPerCountry[country]}
                onChange={(e) => updateParam('disruptionsPerCountry', { ...params.disruptionsPerCountry, [country]: parseInt(e.target.value) || 0 })}
                min={0}
                max={10}
              />
            </div>
          ))}
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="disruption-duration">Duration (rounds)</label>
            <input id="disruption-duration" className={s.input} type="number" value={params.disruptionDuration} onChange={(e) => updateParam('disruptionDuration', parseInt(e.target.value) || 1)} min={1} max={10} />
          </div>
        </div>
        <DisruptionScheduler totalRounds={params.totalRounds} schedule={schedule} duration={params.disruptionDuration} onChange={setSchedule} />
      </div>

      <button type="button" className={`${s.btnSecondary} ${s.mbMd}`} onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </button>

      {showAdvanced && (
        <div className={`${s.card} ${s.mbLg}`}>
          <h3 className={s.mbMd}>Advanced Parameters</h3>
          <div className={styles.paramGrid}>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="min-order">Minimum Order</label>
              <input id="min-order" className={s.input} type="number" value={params.minimumOrder} onChange={(e) => updateParam('minimumOrder', parseInt(e.target.value) || 0)} min={0} step={10} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="capacity-target">Capacity Target (%)</label>
              <input id="capacity-target" className={s.input} type="number" value={params.supplierCapacityTargetMultiplier * 100} onChange={(e) => updateParam('supplierCapacityTargetMultiplier', (parseFloat(e.target.value) || 0) / 100)} min={0} step={5} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="capacity-target-weight">Target Capacity Weight (%)</label>
              <input id="capacity-target-weight" className={s.input} type="number" value={params.supplierCapacityTargetWeight * 100} onChange={(e) => updateCapacityTargetWeight((parseFloat(e.target.value) || 0) / 100)} min={0} max={100} step={5} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="capacity-floor">Capacity Floor / Player</label>
              <input id="capacity-floor" className={s.input} type="number" value={params.supplierCapacityMinPerPlayer} onChange={(e) => updateParam('supplierCapacityMinPerPlayer', parseInt(e.target.value) || 0)} min={0} step={10} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Supplier Capacity Rules</label>
              <p className={styles.descText}>
                Round 1 supplier capacity starts at {Math.round(params.supplierCapacityTargetMultiplier * 100)}% of total initial setup orders.
                <br />
                Future target capacity becomes {Math.round(params.supplierCapacityTargetMultiplier * 100)}% of the prior round's submitted orders.
                <br />
                Actual capacity blends {Math.round(params.supplierCapacityPriorWeight * 100)}% prior capacity with {Math.round(params.supplierCapacityTargetWeight * 100)}% target capacity.
                Prior capacity weight is always derived as {Math.round(params.supplierCapacityPriorWeight * 100)}%.
                <br />
                Capacity never drops below {params.supplierCapacityMinPerPlayer} units per player.
              </p>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Supplier Order Limits</label>
              <p className={styles.descText}>
                Any non-zero order must be at least {params.minimumOrder} units.
                <br />
                New suppliers start at {Math.round(params.maxOrderIncreasePercent * 100)} units, and supplier caps never drop below that floor.
                <br />
                If a player increases an order, next turn's cap becomes {Math.round(params.maxOrderIncreasePercent * 100)}% of that order.
                If they repeat the same order, the cap stays the same. If they decrease the order, next turn's cap becomes 70% prior cap plus 30% of the new order at the same amplifier.
                Caps stay frozen while a disruption is active.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className={`${s.error} ${s.mbMd}`}>{error}</p>}

      <div className={s.row}>
        <button type="submit" className={s.btnPrimary} disabled={loading}>
          {loading ? 'Creating...' : 'Create Session'}
        </button>
        <button type="button" className={s.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
