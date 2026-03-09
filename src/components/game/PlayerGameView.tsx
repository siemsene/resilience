import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import type { SessionDoc, PlayerStateDoc, SupplierKey, OrderMap } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, COUNTRY_LABELS } from '../../types';
import { GameBoard } from './GameBoard';
import { RoundHeader } from './RoundHeader';
import { DisruptionBanner } from './DisruptionBanner';
import { RoundResultsOverlay } from './RoundResultsOverlay';
import { getCurrentSupplierMaxOrder } from '../../utils/orderLimits';
import s from '../../styles/shared.module.css';
import styles from './PlayerGameView.module.css';

interface Props {
  session: SessionDoc;
  playerState: PlayerStateDoc;
  playerId: string;
  sessionId: string;
}

function createEmptyOrders(): OrderMap {
  const emptyOrders: Record<string, number> = {};
  SUPPLIER_KEYS.forEach(key => { emptyOrders[key] = 0; });
  return emptyOrders as OrderMap;
}

export function PlayerGameView({ session, playerState, playerId, sessionId }: Props) {
  const [rawOrders, setRawOrders] = useState<OrderMap>(() => createEmptyOrders());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const latestRound = playerState.roundHistory.length > 0
    ? playerState.roundHistory[playerState.roundHistory.length - 1]
    : null;
  const latestRoundNumber = latestRound?.round ?? 0;
  const [dismissedRound, setDismissedRound] = useState<number>(
    session.currentRound > 1 ? latestRoundNumber : 0
  );
  const repeatSourceOrders = useMemo(() => {
    if (latestRound?.orders) {
      return latestRound.orders;
    }

    const initialOrders = createEmptyOrders();
    let hasInitialOrders = false;

    for (const key of SUPPLIER_KEYS) {
      const initialOrder = playerState.suppliers?.[key]?.lastOrder || 0;
      if (initialOrder > 0) {
        hasInitialOrders = true;
      }
      initialOrders[key] = initialOrder;
    }

    return hasInitialOrders ? initialOrders : null;
  }, [latestRound?.orders, playerState.suppliers]);
  const repeatBlockedCountries = useMemo(() => {
    if (!repeatSourceOrders) {
      return [];
    }

    return Array.from(new Set(
      SUPPLIER_KEYS
        .filter(key => (repeatSourceOrders[key] || 0) > 0 && session.activeDisruptions[SUPPLIER_COUNTRY[key]])
        .map(key => SUPPLIER_COUNTRY[key])
    ));
  }, [repeatSourceOrders, session.activeDisruptions]);

  // Auto-dismiss new round results after the animation window.
  useEffect(() => {
    if (latestRoundNumber === 0 || latestRoundNumber <= dismissedRound) {
      return;
    }
    const timer = setTimeout(() => setDismissedRound(latestRoundNumber), 8000);
    return () => clearTimeout(timer);
  }, [dismissedRound, latestRoundNumber]);

  useEffect(() => {
    setRawOrders(createEmptyOrders());
    setSubmitError('');
  }, [playerId, session.currentRound]);

  const hasSubmitted = session.submittedPlayers?.includes(playerId);
  const showResults = latestRoundNumber > 0 && latestRoundNumber > dismissedRound;

  // Disrupted countries cannot be ordered from in the current round.
  // Keep the UI and payload in sync by forcing those order values to 0.
  const orders = useMemo<OrderMap>(() => {
    const next = { ...rawOrders } as OrderMap;
    for (const key of SUPPLIER_KEYS) {
      const country = SUPPLIER_COUNTRY[key];
      if (session.activeDisruptions[country]) {
        next[key] = 0;
      }
    }
    return next;
  }, [rawOrders, session.activeDisruptions]);
  const minimumOrder = session.params.minimumOrder ?? 100;

  const handleOrderChange = (key: SupplierKey, value: number) => {
    const country = SUPPLIER_COUNTRY[key];
    if (session.activeDisruptions[country]) {
      setRawOrders(prev => ({ ...prev, [key]: 0 }));
      return;
    }
    setSubmitError('');
    setRawOrders(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const getSupplierLabel = (key: SupplierKey): string => {
    const country = SUPPLIER_COUNTRY[key];
    return `${COUNTRY_LABELS[country]} ${key.toLowerCase().includes('reliable') && !key.toLowerCase().includes('unreliable') ? 'Reliable' : 'Unreliable'}`;
  };

  const validateOrders = (): string[] => {
    const warnings: string[] = [];

    for (const key of SUPPLIER_KEYS) {
      const val = orders[key] || 0;
      const supplierLabel = getSupplierLabel(key);
      if (val < 0) {
        warnings.push(`Invalid order for ${supplierLabel}.`);
        continue;
      }
      if (val > 0 && val < minimumOrder) {
        warnings.push(`Order for ${supplierLabel} must be at least ${minimumOrder} units or 0.`);
      }

      const country = SUPPLIER_COUNTRY[key];

      // Can't order from disrupted country
      if (session.activeDisruptions[country] && val > 0) {
        warnings.push(`Cannot order from ${COUNTRY_LABELS[country]} — supply disrupted!`);
      }

      // Validate order constraints
      const supplierState = playerState.suppliers?.[key];
      if (supplierState?.active) {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState);
        if (val > maxOrder) {
          warnings.push(`Order for ${supplierLabel} exceeds max (${maxOrder}). Last order: ${supplierState.lastOrder}.`);
        }
      } else {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState);
        if (val > maxOrder) {
          warnings.push(`${supplierLabel} is limited to ${maxOrder} units.`);
        }
      }
    }

    return warnings;
  };

  const validationWarnings = useMemo(
    () => validateOrders(),
    [minimumOrder, orders, playerState.suppliers, session.activeDisruptions]
  );
  const submitDisabled = submitting || validationWarnings.length > 0;
  const repeatDisabled = submitting || !repeatSourceOrders || repeatBlockedCountries.length > 0;

  const handleRepeatPreviousOrders = () => {
    if (!repeatSourceOrders || repeatBlockedCountries.length > 0) {
      return;
    }

    setSubmitError('');
    const nextOrders = createEmptyOrders();
    for (const key of SUPPLIER_KEYS) {
      nextOrders[key] = repeatSourceOrders[key] || 0;
    }
    setRawOrders(nextOrders);
  };

  const handleSubmit = async () => {
    if (validationWarnings.length > 0) {
      return;
    }

    setSubmitError('');
    setSubmitting(true);
    try {
      const submitFn = httpsCallable(functions, 'submitOrders');
      await submitFn({ sessionId, playerId, orders });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit orders');
    }
    setSubmitting(false);
  };

  return (
    <div className={styles.gameView}>
      <RoundHeader
        round={session.currentRound}
        totalRounds={session.params.totalRounds}
        cash={playerState.cash}
        inventory={playerState.inventory}
        marketDemand={playerState.marketDemand}
        phase={hasSubmitted ? 'waiting' : session.currentPhase}
      />

      <DisruptionBanner activeDisruptions={session.activeDisruptions} />

      <GameBoard
        session={session}
        playerState={playerState}
        orders={orders}
        onOrderChange={handleOrderChange}
        disabled={hasSubmitted || submitting}
        validationWarnings={validationWarnings}
        submitControls={!hasSubmitted && session.currentPhase === 'ordering' ? (
          <div className={styles.boardActionStack}>
            <button
              className={`${s.btnSecondary} ${s.btnLarge} ${styles.boardRepeatButton}`}
              onClick={handleRepeatPreviousOrders}
              disabled={repeatDisabled}
              title={
                !repeatSourceOrders
                  ? 'No prior turn or initial setup orders are available yet.'
                  : repeatBlockedCountries.length > 0
                    ? `Cannot repeat saved orders while ${repeatBlockedCountries.map(country => COUNTRY_LABELS[country]).join(', ')} is disrupted.`
                    : session.currentRound === 1
                      ? 'Copy the initial setup supplier orders into the current plan.'
                      : 'Copy the prior turn orders into the current plan.'
              }
            >
              Repeat Prior Turn Orders
            </button>
            {repeatBlockedCountries.length > 0 && (
              <p className={styles.repeatHint}>
                Repeat is disabled because last turn included {repeatBlockedCountries.map(country => COUNTRY_LABELS[country]).join(', ')} suppliers that are currently disrupted.
              </p>
            )}
            <button
              className={`${s.btnPrimary} ${s.btnLarge} ${styles.boardSubmitButton}`}
              onClick={handleSubmit}
              disabled={submitDisabled}
            >
              {submitting ? 'Submitting...' : 'Submit Orders'}
            </button>
          </div>
        ) : undefined}
      />

      {submitError && <p className={s.error} style={{ textAlign: 'center', margin: '12px 0' }}>{submitError}</p>}

      {hasSubmitted && (
        <div className={styles.waitingOverlay}>
          <div className={s.spinner} />
          <span>Waiting for other players...</span>
          <span className={styles.waitingCount}>
            {session.submittedPlayers?.length || 0} / {Object.keys(session.players).length} submitted
          </span>
        </div>
      )}

      {showResults && latestRound && (
        <RoundResultsOverlay round={latestRound} onDismiss={() => setDismissedRound(latestRoundNumber)} />
      )}
    </div>
  );
}
