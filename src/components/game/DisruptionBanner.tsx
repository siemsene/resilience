import type { ActiveDisruption, Country } from '../../types';
import { COUNTRY_LABELS } from '../../types';
import styles from './DisruptionBanner.module.css';

interface Props {
  activeDisruptions: Record<Country, ActiveDisruption | null>;
}

export function DisruptionBanner({ activeDisruptions }: Props) {
  const active = Object.entries(activeDisruptions)
    .filter(([, d]) => d !== null) as [Country, ActiveDisruption][];

  if (active.length === 0) return null;

  return (
    <div className={styles.banner}>
      {active.map(([country, disruption]) => (
        <div key={country} className={styles.alert} data-country={country}>
          <span className={styles.icon}>{'⚠️'}</span>
          <span>
            <strong>{COUNTRY_LABELS[country]}</strong> supply disrupted!
            <span className={styles.duration}>
              (Rounds {disruption.startRound}-{disruption.endsAfterRound})
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
