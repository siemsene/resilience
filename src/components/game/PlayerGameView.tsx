import { useCallback, useMemo, useState } from 'react';
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

interface DraftState {
  identity: string;
  orderInputs: Record<SupplierKey, string>;
  submitError: string;
}

function createEmptyOrders(): OrderMap {
  const emptyOrders: Record<string, number> = {};
  SUPPLIER_KEYS.forEach(key => { emptyOrders[key] = 0; });
  return emptyOrders as OrderMap;
}

function createEmptyOrderInputs(): Record<SupplierKey, string> {
  const emptyOrders: Record<string, string> = {};
  SUPPLIER_KEYS.forEach(key => { emptyOrders[key] = ''; });
  return emptyOrders as Record<SupplierKey, string>;
}

function parseOrderInput(value: string): { valid: true; value: number } | { valid: false } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: 0 };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { valid: false };
  }

  return { valid: true, value: parseInt(trimmed, 10) };
}

export function PlayerGameView({ session, playerState, playerId, sessionId }: Props) {
  const roundIdentity = `${playerId}:${session.currentRound}`;
  const [draft, setDraft] = useState<DraftState>(() => ({
    identity: roundIdentity,
    orderInputs: createEmptyOrderInputs(),
    submitError: '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [confirmingResults, setConfirmingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');
  const latestRound = playerState.roundHistory.length > 0
    ? playerState.roundHistory[playerState.roundHistory.length - 1]
    : null;
  const latestRoundNumber = latestRound?.round ?? 0;
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

  const draftIsCurrent = draft.identity === roundIdentity;
  const rawOrderInputs = draftIsCurrent ? draft.orderInputs : createEmptyOrderInputs();
  const submitError = draftIsCurrent ? draft.submitError : '';

  const updateDraft = (updater: (state: DraftState) => DraftState) => {
    setDraft((prev) => {
      const currentState = prev.identity === roundIdentity
        ? prev
        : { identity: roundIdentity, orderInputs: createEmptyOrderInputs(), submitError: '' };
      return updater(currentState);
    });
  };

  const setDraftSubmitError = (message: string) => {
    updateDraft((currentState) => ({ ...currentState, submitError: message }));
  };

  const clearDraftError = () => {
    updateDraft((currentState) => ({ ...currentState, submitError: '' }));
  };

  const resultsRound = session.resultsRound ?? 0;
  const showingCurrentResults = session.currentPhase === 'results'
    && latestRoundNumber > 0
    && latestRoundNumber === resultsRound;
  const hasConfirmedCurrentResults = showingCurrentResults
    && playerState.lastConfirmedResultsRound === resultsRound;
  const personallyOrdering = hasConfirmedCurrentResults && session.currentPhase === 'results';
  const hasSubmitted = playerState.lastSubmittedRound === session.currentRound;
  const displayRound = session.currentPhase === 'results' && resultsRound > 0 && !personallyOrdering
    ? resultsRound
    : session.currentRound;
  const showResults = showingCurrentResults && !hasConfirmedCurrentResults;
  const isOrdering = session.currentPhase === 'ordering' || personallyOrdering;
  const otherPlayerCount = Math.max(0, session.playerCount - 1);
  const otherSubmittedCount = Math.max(0, session.submittedCount - (hasSubmitted ? 1 : 0));
  const showSubmissionAlert = isOrdering && session.playerCount > 1;
  const submissionAlert = showSubmissionAlert
    ? `${otherSubmittedCount.toLocaleString()} / ${otherPlayerCount.toLocaleString()} others submitted`
    : null;
  const submissionAlertUrgent = showSubmissionAlert && !hasSubmitted && otherSubmittedCount >= otherPlayerCount;

  const orders = useMemo<OrderMap>(() => {
    const next = {} as OrderMap;
    for (const key of SUPPLIER_KEYS) {
      const parsed = parseOrderInput(rawOrderInputs[key] || '');
      next[key] = parsed.valid ? parsed.value : 0;
      const country = SUPPLIER_COUNTRY[key];
      if (session.activeDisruptions[country]) {
        next[key] = 0;
      }
    }
    return next;
  }, [rawOrderInputs, session.activeDisruptions]);
  const minimumOrder = session.params.minimumOrder ?? 100;

  const handleOrderChange = (key: SupplierKey, value: string) => {
    const country = SUPPLIER_COUNTRY[key];
    if (session.activeDisruptions[country]) {
      updateDraft((currentState) => ({
        ...currentState,
        orderInputs: { ...currentState.orderInputs, [key]: '' },
        submitError: '',
      }));
      return;
    }
    updateDraft((currentState) => ({
      ...currentState,
      orderInputs: { ...currentState.orderInputs, [key]: value },
      submitError: '',
    }));
  };

  const getSupplierLabel = (key: SupplierKey): string => {
    const country = SUPPLIER_COUNTRY[key];
    return `${COUNTRY_LABELS[country]} ${key.toLowerCase().includes('reliable') && !key.toLowerCase().includes('unreliable') ? 'Reliable' : 'Unreliable'}`;
  };

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];

    for (const key of SUPPLIER_KEYS) {
      const rawValue = rawOrderInputs[key] || '';
      const parsed = parseOrderInput(rawValue);
      const supplierLabel = getSupplierLabel(key);
      if (!parsed.valid) {
        warnings.push(`Order for ${supplierLabel} must be a non-negative whole number.`);
        continue;
      }
      const val = orders[key] || 0;
      if (val > 0 && val < minimumOrder) {
        warnings.push(`Order for ${supplierLabel} must be at least ${minimumOrder} units or 0.`);
      }

      const country = SUPPLIER_COUNTRY[key];
      if (session.activeDisruptions[country] && val > 0) {
        warnings.push(`Cannot order from ${COUNTRY_LABELS[country]} — supply disrupted!`);
      }

      const supplierState = playerState.suppliers?.[key];
      if (supplierState?.active) {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState, session.params);
        if (val > maxOrder) {
          warnings.push(`Order for ${supplierLabel} exceeds max (${maxOrder}). Last order: ${supplierState.lastOrder}.`);
        }
      } else {
        const maxOrder = getCurrentSupplierMaxOrder(supplierState, session.params);
        if (val > maxOrder) {
          warnings.push(`${supplierLabel} is limited to ${maxOrder} units.`);
        }
      }
    }

    return warnings;
  }, [minimumOrder, orders, playerState.suppliers, rawOrderInputs, session.activeDisruptions, session.params]);
  const submitDisabled = submitting || validationWarnings.length > 0;
  const repeatDisabled = submitting || !repeatSourceOrders || repeatBlockedCountries.length > 0;

  const handleRepeatPreviousOrders = () => {
    if (!repeatSourceOrders || repeatBlockedCountries.length > 0) {
      return;
    }

    clearDraftError();
    const nextOrderInputs = createEmptyOrderInputs();
    for (const key of SUPPLIER_KEYS) {
      const value = repeatSourceOrders[key] || 0;
      nextOrderInputs[key] = value > 0 ? String(value) : '';
    }
    updateDraft((currentState) => ({ ...currentState, orderInputs: nextOrderInputs, submitError: '' }));
  };

  const handleSubmit = async () => {
    if (validationWarnings.length > 0) {
      return;
    }

    clearDraftError();
    setSubmitting(true);
    try {
      const submitFn = httpsCallable(functions, 'submitOrders');
      await submitFn({ sessionId, playerId, orders });
    } catch (err) {
      setDraftSubmitError(err instanceof Error ? err.message : 'Failed to submit orders');
    }
    setSubmitting(false);
  };

  const handleTimerExpired = useCallback(async () => {
    if (hasSubmitted || submitting) return;

    const hasAnyOrders = SUPPLIER_KEYS.some(k => orders[k] > 0);
    if (hasAnyOrders) {
      await handleSubmit();
      return;
    }

    if (repeatSourceOrders) {
      const filteredOrders = { ...repeatSourceOrders };
      for (const key of SUPPLIER_KEYS) {
        if (session.activeDisruptions[SUPPLIER_COUNTRY[key]]) {
          filteredOrders[key] = 0;
        }
      }
      setSubmitting(true);
      try {
        const submitFn = httpsCallable(functions, 'submitOrders');
        await submitFn({ sessionId, playerId, orders: filteredOrders });
      } catch (err) {
        setDraftSubmitError(err instanceof Error ? err.message : 'Auto-submit failed');
      }
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    try {
      const submitFn = httpsCallable(functions, 'submitOrders');
      await submitFn({ sessionId, playerId, orders: createEmptyOrders() });
    } catch (err) {
      setDraftSubmitError(err instanceof Error ? err.message : 'Auto-submit failed');
    }
    setSubmitting(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSubmitted, submitting, orders, repeatSourceOrders, session.activeDisruptions, sessionId, playerId]);

  const handleConfirmResults = async () => {
    if (!showResults) {
      return;
    }

    setResultsError('');
    setConfirmingResults(true);
    try {
      const confirmFn = httpsCallable(functions, 'confirmRoundResults');
      await confirmFn({ sessionId, playerId });
    } catch (err) {
      setResultsError(err instanceof Error ? err.message : 'Failed to confirm round results');
    }
    setConfirmingResults(false);
  };

  return (
    <div className={styles.gameView}>
      <RoundHeader
        round={displayRound}
        totalRounds={session.params.totalRounds}
        cash={playerState.cash}
        inventory={playerState.inventory}
        marketDemand={playerState.marketDemand}
        phase={hasSubmitted ? 'waiting' : personallyOrdering ? 'ordering' : session.currentPhase}
        submissionAlert={submissionAlert}
        submissionAlertUrgent={submissionAlertUrgent}
        deadline={isOrdering && !hasSubmitted ? session.roundDeadline : undefined}
        onTimerExpired={handleTimerExpired}
      />

      <DisruptionBanner activeDisruptions={session.activeDisruptions} />

      <GameBoard
        session={session}
        playerState={playerState}
        orders={orders}
        orderInputs={rawOrderInputs}
        onOrderChange={handleOrderChange}
        disabled={hasSubmitted || submitting || !isOrdering}
        validationWarnings={validationWarnings}
        submitControls={!hasSubmitted && isOrdering ? (
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

      {submitError && <p className={`${s.error} ${s.textCenter}`}>{submitError}</p>}
      {showResults && resultsError && <p className={`${s.error} ${s.textCenter}`}>{resultsError}</p>}

      {hasSubmitted && (
        <div className={styles.waitingOverlay}>
          <div className={s.spinner} />
          <span>Waiting for other players...</span>
          <span className={styles.waitingCount}>
            {session.submittedCount} / {session.playerCount} submitted
          </span>
        </div>
      )}

      {showResults && latestRound && (
        <RoundResultsOverlay
          round={latestRound}
          onConfirm={handleConfirmResults}
          confirming={confirmingResults}
          confirmedCount={session.resultsConfirmedCount || 0}
          playerCount={session.playerCount}
          deadline={session.roundDeadline}
        />
      )}
    </div>
  );
}

