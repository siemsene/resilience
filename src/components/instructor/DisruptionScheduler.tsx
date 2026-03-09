import type { DisruptionSchedule, Country } from '../../types';
import styles from './DisruptionScheduler.module.css';

interface Props {
  totalRounds: number;
  schedule: DisruptionSchedule;
  duration: number;
  onChange: (schedule: DisruptionSchedule) => void;
}

const COUNTRY_COLORS: Record<Country, string> = {
  china: 'var(--china-primary)',
  mexico: 'var(--mexico-primary)',
  us: 'var(--us-primary)',
};

const COUNTRY_LABELS: Record<Country, string> = {
  china: 'China',
  mexico: 'Mexico',
  us: 'US',
};

export function DisruptionScheduler({ totalRounds, schedule, duration, onChange }: Props) {
  const toggleRound = (country: Country, round: number) => {
    const current = schedule[country];
    const idx = current.indexOf(round);
    const newRounds = idx >= 0
      ? current.filter(r => r !== round)
      : [...current, round].sort((a, b) => a - b);

    onChange({ ...schedule, [country]: newRounds });
  };

  const roundNumbers = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className={styles.scheduler}>
      {/* Round number header */}
      <div className={styles.row}>
        <div className={styles.label}></div>
        <div className={styles.timeline}>
          {roundNumbers.map(r => (
            <div key={r} className={styles.roundNum}>
              {r % 5 === 0 || r === 1 ? r : ''}
            </div>
          ))}
        </div>
      </div>

      {(['china', 'mexico', 'us'] as Country[]).map(country => (
        <div key={country} className={styles.row}>
          <div className={styles.label} style={{ color: COUNTRY_COLORS[country] }}>
            {COUNTRY_LABELS[country]}
          </div>
          <div className={styles.timeline}>
            {roundNumbers.map(r => {
              const isStart = schedule[country].includes(r);
              const isDisrupted = schedule[country].some(start =>
                r >= start && r < start + duration
              );

              return (
                <button
                  key={r}
                  type="button"
                  className={`${styles.cell} ${isStart ? styles.cellStart : ''} ${isDisrupted ? styles.cellActive : ''}`}
                  style={{
                    backgroundColor: isDisrupted ? COUNTRY_COLORS[country] : undefined,
                    opacity: isDisrupted && !isStart ? 0.5 : undefined,
                  }}
                  onClick={() => toggleRound(country, r)}
                  title={`Round ${r}${isStart ? ' (disruption start)' : isDisrupted ? ' (disrupted)' : ''}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
