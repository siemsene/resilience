import type { SessionParams, SupplierState } from '../types';

const DEFAULT_MAX_ORDER_AMPLIFIER = 1.4;
const DEFAULT_MAX_ORDER_BASELINE = 100;

function getMaxOrderAmplifier(params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null): number {
  const amplifier = params?.maxOrderIncreasePercent;
  return typeof amplifier === 'number' && Number.isFinite(amplifier) && amplifier > 0
    ? amplifier
    : DEFAULT_MAX_ORDER_AMPLIFIER;
}

function getMinimumSupplierMaxOrder(params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null): number {
  return Math.max(0, Math.round(DEFAULT_MAX_ORDER_BASELINE * getMaxOrderAmplifier(params)));
}

function sanitizeOrder(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function sanitizeLimit(
  value: number,
  params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null,
): number {
  const minimumSupplierMaxOrder = getMinimumSupplierMaxOrder(params);
  if (!Number.isFinite(value)) {
    return minimumSupplierMaxOrder;
  }

  return Math.max(minimumSupplierMaxOrder, Math.round(value));
}

export function getInitialSupplierMaxOrder(
  initialOrder: number,
  params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null,
): number {
  const sanitizedOrder = sanitizeOrder(initialOrder);
  if (sanitizedOrder <= 0) {
    return getMinimumSupplierMaxOrder(params);
  }

  return sanitizeLimit(sanitizedOrder * getMaxOrderAmplifier(params), params);
}

export function getCurrentSupplierMaxOrder(
  supplierState?: SupplierState | null,
  params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null,
): number {
  if (!supplierState) {
    return getMinimumSupplierMaxOrder(params);
  }

  if (typeof supplierState.maxOrder === 'number') {
    return sanitizeLimit(supplierState.maxOrder, params);
  }

  if (supplierState.lastOrder > 0) {
    return sanitizeLimit(supplierState.lastOrder * getMaxOrderAmplifier(params), params);
  }

  return getMinimumSupplierMaxOrder(params);
}

export function getNextSupplierMaxOrder(
  previousSupplierState: SupplierState | null | undefined,
  placedOrder: number,
  params?: Pick<SessionParams, 'maxOrderIncreasePercent'> | null,
  blockedByDisruption = false,
): number {
  const currentMaxOrder = getCurrentSupplierMaxOrder(previousSupplierState, params);
  if (blockedByDisruption) {
    return currentMaxOrder;
  }

  const currentOrder = sanitizeOrder(placedOrder);
  const priorOrder = sanitizeOrder(previousSupplierState?.lastOrder || 0);
  const amplifier = getMaxOrderAmplifier(params);

  if (currentOrder > priorOrder) {
    return sanitizeLimit(currentOrder * amplifier, params);
  }

  if (currentOrder === priorOrder) {
    return currentMaxOrder;
  }

  return sanitizeLimit(
    (currentMaxOrder * 0.7) + ((currentOrder * amplifier) * 0.3),
    params,
  );
}
