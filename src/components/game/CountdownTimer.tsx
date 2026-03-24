import { useEffect, useRef, useState } from 'react';
import styles from './CountdownTimer.module.css';

interface Props {
  deadline: number;
  onExpired: () => void;
}

export function CountdownTimer({ deadline, onExpired }: Props) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;

    const interval = setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const urgencyClass = remaining <= 10
    ? styles.critical
    : remaining <= 30
      ? styles.warning
      : '';

  return (
    <span className={`${styles.timer} ${urgencyClass}`}>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}
