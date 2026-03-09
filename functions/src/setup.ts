import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE, OrderMap, SessionDoc, SupplierState, ActiveDisruption } from './types';
import { calculateUnitCost } from './gameLogic';
import { getInitialSupplierMaxOrder } from './orderLimits';

const db = admin.firestore();

export const submitInitialSetup = onCall(async (request) => {
  const { sessionId, playerId, allocations } = request.data;

  if (!sessionId || !playerId || !allocations) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data()!;

  if (session.status !== 'setup') {
    throw new HttpsError('failed-precondition', 'Game is not in setup phase');
  }

  if (!session.players[playerId]) {
    throw new HttpsError('not-found', 'Player not found in session');
  }

  if (session.submittedPlayers?.includes(playerId)) {
    throw new HttpsError('already-exists', 'You have already submitted your setup');
  }

  // Validate allocations sum to startingDemand
  const allocationMap = allocations as OrderMap;
  let total = 0;
  for (const key of SUPPLIER_KEYS) {
    const val = allocationMap[key] || 0;
    if (val < 0 || !Number.isInteger(val)) {
      throw new HttpsError('invalid-argument', `Invalid allocation for ${key}`);
    }
    total += val;
  }

  if (total !== session.params.startingDemand) {
    throw new HttpsError('invalid-argument',
      `Allocations must sum to ${session.params.startingDemand}. Got ${total}`);
  }

  // Build transit arrays and calculate costs
  const transit: Record<string, number[]> = {
    china: new Array(session.params.transitTurns.china).fill(0),
    mexico: new Array(session.params.transitTurns.mexico).fill(0),
    us: new Array(session.params.transitTurns.us).fill(0),
  };

  const suppliers: Record<string, SupplierState> = {};
  let totalCost = 0;

  for (const key of SUPPLIER_KEYS) {
    const amount = allocationMap[key] || 0;
    const country = SUPPLIER_COUNTRY[key];
    const isUnreliable = !SUPPLIER_RELIABLE[key];
    const transitTurns = session.params.transitTurns[country];

    suppliers[key] = {
      lastOrder: amount,
      maxOrder: getInitialSupplierMaxOrder(amount),
      totalOrdered: amount * transitTurns,
      active: amount > 0,
    };

    if (amount > 0) {
      // Fill all transit boxes for this route
      for (let i = 0; i < transitTurns; i++) {
        transit[country][i] += amount;
      }

      // Cost = units * transitTurns * unitCost
      const unitCost = calculateUnitCost(
        session.params.baseCost[country],
        isUnreliable,
        session.params.unreliableCostModifier,
        amount,
        session.params.volumeDiscountThresholds
      );
      totalCost += amount * transitTurns * unitCost;
    }
  }

  const startingCash = session.params.startingCash;

  // Create player state doc
  const playerStateRef = db.collection('sessions').doc(sessionId)
    .collection('playerStates').doc(playerId);

  await playerStateRef.set({
    playerId,
    sessionId,
    playerName: session.players[playerId].name,
    cash: startingCash - totalCost,
    inventory: 0,
    marketDemand: session.params.startingDemand,
    suppliers,
    transit,
    roundHistory: [],
  });

  // Add to submitted players
  const newSubmitted = [...(session.submittedPlayers || []), playerId];
  const allPlayersSubmitted = newSubmitted.length === Object.keys(session.players).length;

  const updateData: Partial<SessionDoc> = {
    submittedPlayers: newSubmitted,
  };

  if (allPlayersSubmitted) {
    // Transition to active game, round 1
    updateData.status = 'active';
    updateData.currentRound = 1;
    updateData.currentPhase = 'ordering';
    updateData.submittedPlayers = [];

    // Check for round-1 disruptions
    const activeDisruptions: Record<string, ActiveDisruption | null> = {
      china: null,
      mexico: null,
      us: null,
    };
    for (const country of ['china', 'mexico', 'us'] as const) {
      if (session.disruptionSchedule[country]?.includes(1)) {
        activeDisruptions[country] = {
          startRound: 1,
          endsAfterRound: 1 + session.params.disruptionDuration - 1,
        };
      }
    }
    updateData.activeDisruptions = activeDisruptions;
  }

  await sessionRef.update(updateData);

  return { success: true, cashRemaining: startingCash - totalCost };
});
