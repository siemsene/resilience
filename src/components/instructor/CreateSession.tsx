import { useState } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_PARAMS, type SessionParams, type Country, type DisruptionSchedule } from '../../types';
import { generateDisruptionSchedule, generateSessionCode } from '../../utils/disruptions';
import { DisruptionScheduler } from './DisruptionScheduler';
import s from '../../styles/shared.module.css';
import styles from './CreateSession.module.css';

interface Props {
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

export function CreateSession({ onCreated, onCancel }: Props) {
  const { user } = useAuth();
  const [sessionName, setSessionName] = useState('');
  const [params, setParams] = useState<SessionParams>({ ...DEFAULT_PARAMS });
  const [schedule, setSchedule] = useState<DisruptionSchedule>(() =>
    generateDisruptionSchedule(DEFAULT_PARAMS.totalRounds, DEFAULT_PARAMS.disruptionsPerCountry)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = <K extends keyof SessionParams>(key: K, value: SessionParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const regenerateSchedule = () => {
    setSchedule(generateDisruptionSchedule(params.totalRounds, params.disruptionsPerCountry));
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !sessionName.trim()) return;

    setError('');
    setLoading(true);
    try {
      const sessionCode = generateSessionCode();
      const sessionRef = doc(collection(db, 'sessions'));

      await setDoc(sessionRef, {
        instructorUid: user.uid,
        sessionCode,
        sessionName: sessionName.trim(),
        status: 'lobby',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        params,
        disruptionSchedule: schedule,
        activeDisruptions: { china: null, mexico: null, us: null },
        players: {},
        currentRound: 0,
        currentPhase: 'ordering',
        submittedPlayers: [],
        totalMarketDemand: 0,
      });

      onCreated(sessionRef.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create session'));
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleCreate}>
      <h2 style={{ marginBottom: 'var(--space-lg)' }}>Create New Session</h2>

      <div className={s.card} style={{ marginBottom: 'var(--space-lg)' }}>
        <div className={s.formGroup}>
          <label className={s.label}>Session Name</label>
          <input
            className={s.input}
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            placeholder="e.g., SCM 301 - Spring 2026"
            required
          />
        </div>

        <div className={styles.paramGrid}>
          <div className={s.formGroup}>
            <label className={s.label}>Total Rounds</label>
            <input
              className={s.input}
              type="number"
              value={params.totalRounds}
              onChange={e => {
                const v = parseInt(e.target.value) || 30;
                updateParam('totalRounds', v);
              }}
              min={5}
              max={100}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Starting Cash ($)</label>
            <input
              className={s.input}
              type="number"
              value={params.startingCash}
              onChange={e => updateParam('startingCash', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Starting Demand</label>
            <input
              className={s.input}
              type="number"
              value={params.startingDemand}
              onChange={e => updateParam('startingDemand', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Selling Price ($)</label>
            <input
              className={s.input}
              type="number"
              value={params.sellingPrice}
              onChange={e => updateParam('sellingPrice', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Holding Cost / Unit ($)</label>
            <input
              className={s.input}
              type="number"
              value={params.holdingCostPerUnit}
              onChange={e => updateParam('holdingCostPerUnit', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Loyalty %</label>
            <input
              className={s.input}
              type="number"
              value={params.loyaltyPercent * 100}
              onChange={e => updateParam('loyaltyPercent', (parseFloat(e.target.value) || 0) / 100)}
              min={0}
              max={100}
              step={5}
            />
          </div>
        </div>
      </div>

      {/* Base costs per country */}
      <div className={s.card} style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Supplier Base Costs</h3>
        <div className={styles.paramGrid}>
          {(['china', 'mexico', 'us'] as Country[]).map(country => (
            <div key={country} className={s.formGroup}>
              <label className={s.label}>{country === 'us' ? 'US' : country.charAt(0).toUpperCase() + country.slice(1)} Base Cost ($)</label>
              <input
                className={s.input}
                type="number"
                value={params.baseCost[country]}
                onChange={e => updateParam('baseCost', { ...params.baseCost, [country]: parseFloat(e.target.value) || 0 })}
              />
            </div>
          ))}
          <div className={s.formGroup}>
            <label className={s.label}>Unreliable Cost Modifier</label>
            <input
              className={s.input}
              type="number"
              value={params.unreliableCostModifier}
              onChange={e => updateParam('unreliableCostModifier', parseFloat(e.target.value) || 0)}
              step={0.05}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Unreliable Cancel Chance</label>
            <input
              className={s.input}
              type="number"
              value={params.unreliableCancellationChance * 100}
              onChange={e => updateParam('unreliableCancellationChance', (parseFloat(e.target.value) || 0) / 100)}
              min={0}
              max={100}
              step={5}
            />
          </div>
        </div>
      </div>

      {/* Disruption schedule */}
      <div className={s.card} style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3>Disruption Schedule</h3>
          <button type="button" className={`${s.btnSecondary} ${s.btnSmall}`} onClick={regenerateSchedule}>
            Randomize
          </button>
        </div>
        <div className={styles.paramGrid} style={{ marginBottom: 'var(--space-md)' }}>
          {(['china', 'mexico', 'us'] as Country[]).map(country => (
            <div key={country} className={s.formGroup}>
              <label className={s.label}>{country === 'us' ? 'US' : country.charAt(0).toUpperCase() + country.slice(1)} Disruptions</label>
              <input
                className={s.input}
                type="number"
                value={params.disruptionsPerCountry[country]}
                onChange={e => {
                  const v = parseInt(e.target.value) || 0;
                  updateParam('disruptionsPerCountry', { ...params.disruptionsPerCountry, [country]: v });
                }}
                min={0}
                max={10}
              />
            </div>
          ))}
          <div className={s.formGroup}>
            <label className={s.label}>Duration (rounds)</label>
            <input
              className={s.input}
              type="number"
              value={params.disruptionDuration}
              onChange={e => updateParam('disruptionDuration', parseInt(e.target.value) || 1)}
              min={1}
              max={10}
            />
          </div>
        </div>
        <DisruptionScheduler
          totalRounds={params.totalRounds}
          schedule={schedule}
          duration={params.disruptionDuration}
          onChange={setSchedule}
        />
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        className={s.btnSecondary}
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{ marginBottom: 'var(--space-md)' }}
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </button>

      {showAdvanced && (
        <div className={s.card} style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Advanced Parameters</h3>
          <div className={styles.paramGrid}>
            <div className={s.formGroup}>
              <label className={s.label}>Minimum Order</label>
              <input
                className={s.input}
                type="number"
                value={params.minimumOrder}
                onChange={e => updateParam('minimumOrder', parseInt(e.target.value) || 0)}
                min={0}
                step={10}
              />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Supplier Order Limits</label>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                Any non-zero order must be at least {params.minimumOrder} units.
                <br />
                New suppliers start with a max order of 150 units, and supplier caps never drop below 150 units.
                <br />
                If a player orders a supplier's current max, the next-turn max increases to 150% of that cap.
                If they voluntarily skip a round, the next cap falls by 50%.
                <br />
                Valid orders ship in full unless the supplier is disrupted or an unreliable supplier cancels the order.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className={s.error} style={{ marginBottom: 'var(--space-md)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button type="submit" className={s.btnPrimary} disabled={loading}>
          {loading ? 'Creating...' : 'Create Session'}
        </button>
        <button type="button" className={s.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
