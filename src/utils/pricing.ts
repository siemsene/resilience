import type { Country, SessionParams } from '../types';

export function calculateUnitCost(
  params: SessionParams,
  country: Country,
  isReliable: boolean,
  orderAmount: number,
): number {
  let unitCost = params.baseCost[country];
  if (!isReliable) {
    unitCost *= params.unreliableCostModifier;
  }

  let discount = 0;
  const sorted = [...params.volumeDiscountThresholds].sort((a, b) => b.threshold - a.threshold);
  for (const tier of sorted) {
    if (orderAmount >= tier.threshold) {
      discount = tier.discount;
      break;
    }
  }

  return unitCost * (1 - discount);
}
