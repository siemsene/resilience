import {
  SUPPLIER_KEYS,
  SupplierCapacityMap,
  SupplierCapacityState,
  SupplierKey,
  SessionParams,
  PlayerStateDoc,
  OrderMap,
} from './types';

const DEFAULT_TARGET_MULTIPLIER = 1.4;
const DEFAULT_TARGET_WEIGHT = 0.2;
const DEFAULT_MIN_PER_PLAYER = 100;

function createEmptyOrderTotals(): Record<SupplierKey, number> {
  return SUPPLIER_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<SupplierKey, number>);
}

function sanitizeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function normalizeWeights(targetWeight: number) {
  const safeTarget = Number.isFinite(targetWeight)
    ? Math.min(1, Math.max(0, targetWeight))
    : DEFAULT_TARGET_WEIGHT;

  return {
    priorWeight: 1 - safeTarget,
    targetWeight: safeTarget,
  };
}

export function getSupplierCapacityConfig(params: SessionParams) {
  const multiplier = Number.isFinite(params.supplierCapacityTargetMultiplier) && params.supplierCapacityTargetMultiplier > 0
    ? params.supplierCapacityTargetMultiplier
    : DEFAULT_TARGET_MULTIPLIER;
  const { priorWeight, targetWeight } = normalizeWeights(params.supplierCapacityTargetWeight);
  const minPerPlayer = sanitizeInteger(params.supplierCapacityMinPerPlayer, DEFAULT_MIN_PER_PLAYER);

  return {
    multiplier,
    priorWeight,
    targetWeight,
    minPerPlayer,
  };
}

export function getMinimumSupplierCapacity(playerCount: number, params: SessionParams): number {
  const { minPerPlayer } = getSupplierCapacityConfig(params);
  return Math.max(0, playerCount) * minPerPlayer;
}

function sanitizeCapacity(value: number, floor: number): number {
  return Math.max(floor, sanitizeInteger(value, floor));
}

function buildCapacityState(
  orderTotal: number,
  playerCount: number,
  params: SessionParams,
  capacityRound: number,
): SupplierCapacityState {
  const floor = getMinimumSupplierCapacity(playerCount, params);
  const { multiplier } = getSupplierCapacityConfig(params);
  const targetCapacity = sanitizeCapacity(orderTotal * multiplier, floor);

  return {
    actualCapacity: targetCapacity,
    targetCapacity,
    lastRoundOrders: sanitizeInteger(orderTotal, 0),
    capacityRound,
  };
}

function sanitizeCapacityState(
  state: SupplierCapacityState,
  floor: number,
  fallbackRound: number,
): SupplierCapacityState {
  return {
    actualCapacity: sanitizeCapacity(state.actualCapacity, floor),
    targetCapacity: sanitizeCapacity(state.targetCapacity, floor),
    lastRoundOrders: sanitizeInteger(state.lastRoundOrders, 0),
    capacityRound: sanitizeInteger(state.capacityRound, fallbackRound),
  };
}

export function getSetupOrderTotalsFromPlayerStates(playerStates: PlayerStateDoc[]): Record<SupplierKey, number> {
  const totals = createEmptyOrderTotals();

  for (const state of playerStates) {
    for (const key of SUPPLIER_KEYS) {
      totals[key] += state.suppliers?.[key]?.lastOrder || 0;
    }
  }

  return totals;
}

export function getSubmittedOrderTotals(orderMaps: OrderMap[]): Record<SupplierKey, number> {
  const totals = createEmptyOrderTotals();

  for (const orders of orderMaps) {
    for (const key of SUPPLIER_KEYS) {
      totals[key] += orders[key] || 0;
    }
  }

  return totals;
}

export function buildInitialSupplierCapacities(
  orderTotals: Record<SupplierKey, number>,
  playerCount: number,
  params: SessionParams,
  capacityRound: number,
): SupplierCapacityMap {
  return SUPPLIER_KEYS.reduce((acc, key) => {
    acc[key] = buildCapacityState(orderTotals[key] || 0, playerCount, params, capacityRound);
    return acc;
  }, {} as SupplierCapacityMap);
}

export function resolveSupplierCapacitiesForRound(
  existingCapacities: Partial<SupplierCapacityMap> | undefined,
  orderTotals: Record<SupplierKey, number>,
  playerCount: number,
  params: SessionParams,
  capacityRound: number,
): SupplierCapacityMap {
  const floor = getMinimumSupplierCapacity(playerCount, params);

  return SUPPLIER_KEYS.reduce((acc, key) => {
    const existing = existingCapacities?.[key];
    acc[key] = existing
      ? sanitizeCapacityState(existing, floor, capacityRound)
      : buildCapacityState(orderTotals[key] || 0, playerCount, params, capacityRound);
    return acc;
  }, {} as SupplierCapacityMap);
}

export function buildNextSupplierCapacities(
  currentCapacities: SupplierCapacityMap,
  submittedOrderTotals: Record<SupplierKey, number>,
  preservePriorCapacity: Record<SupplierKey, boolean>,
  playerCount: number,
  params: SessionParams,
  capacityRound: number,
): SupplierCapacityMap {
  const { multiplier, priorWeight, targetWeight } = getSupplierCapacityConfig(params);
  const floor = getMinimumSupplierCapacity(playerCount, params);

  return SUPPLIER_KEYS.reduce((acc, key) => {
    const prior = currentCapacities[key];
    const lastRoundOrders = sanitizeInteger(submittedOrderTotals[key] || 0, 0);

    if (preservePriorCapacity[key]) {
      acc[key] = sanitizeCapacityState({
        actualCapacity: prior.actualCapacity,
        targetCapacity: prior.targetCapacity,
        lastRoundOrders,
        capacityRound,
      }, floor, capacityRound);
      return acc;
    }

    const targetCapacity = sanitizeCapacity(lastRoundOrders * multiplier, floor);
    const actualCapacity = sanitizeCapacity(
      (prior.actualCapacity * priorWeight) + (targetCapacity * targetWeight),
      floor,
    );

    acc[key] = sanitizeCapacityState({
      actualCapacity,
      targetCapacity,
      lastRoundOrders,
      capacityRound,
    }, floor, capacityRound);
    return acc;
  }, {} as SupplierCapacityMap);
}
