import type { SupplierState } from './types';

export const MIN_SUPPLIER_MAX_ORDER = 150;

function sanitizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_SUPPLIER_MAX_ORDER;
  }

  return Math.max(MIN_SUPPLIER_MAX_ORDER, Math.round(value));
}

export function getInitialSupplierMaxOrder(initialOrder: number): number {
  if (initialOrder <= 0) {
    return MIN_SUPPLIER_MAX_ORDER;
  }

  return sanitizeLimit(initialOrder * 1.5);
}

export function getCurrentSupplierMaxOrder(supplierState?: SupplierState | null): number {
  if (!supplierState) {
    return MIN_SUPPLIER_MAX_ORDER;
  }

  if (typeof supplierState.maxOrder === 'number') {
    return sanitizeLimit(supplierState.maxOrder);
  }

  if (supplierState.lastOrder > 0) {
    return sanitizeLimit(supplierState.lastOrder * 1.5);
  }

  return MIN_SUPPLIER_MAX_ORDER;
}

export function getNextSupplierMaxOrder(
  previousMaxOrder: number,
  placedOrder: number,
  blockedByDisruption = false,
): number {
  const currentMaxOrder = sanitizeLimit(previousMaxOrder);

  if (blockedByDisruption) {
    return currentMaxOrder;
  }

  if (placedOrder >= currentMaxOrder) {
    return sanitizeLimit(currentMaxOrder * 1.5);
  }

  if (placedOrder > 0) {
    return currentMaxOrder;
  }

  const decreaseAmount = (currentMaxOrder - placedOrder) * 0.5;
  return sanitizeLimit(currentMaxOrder - decreaseAmount);
}
