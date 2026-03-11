import {
  SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE,
  SupplierKey, Country, OrderMap, SessionParams, ActiveDisruption,
  DisruptionSchedule, RoundHistoryEntry, PlayerStateDoc, SupplierCapacityMap,
} from './types';
import { getNextSupplierMaxOrder } from './orderLimits';
import {
  buildNextSupplierCapacities,
  getSubmittedOrderTotals,
  resolveSupplierCapacitiesForRound,
} from './supplierCapacity';

export function calculateUnitCost(
  baseCost: number,
  isUnreliable: boolean,
  unreliableCostModifier: number,
  orderAmount: number,
  volumeDiscountThresholds: { threshold: number; discount: number }[],
): number {
  let cost = baseCost;
  if (isUnreliable) {
    cost *= unreliableCostModifier;
  }

  let discount = 0;
  const sorted = [...volumeDiscountThresholds].sort((a, b) => b.threshold - a.threshold);
  for (const tier of sorted) {
    if (orderAmount >= tier.threshold) {
      discount = tier.discount;
      break;
    }
  }
  cost *= (1 - discount);
  return cost;
}

interface PlayerRoundData {
  playerId: string;
  orders: OrderMap;
  state: PlayerStateDoc & {
    _arrivals?: number;
    _orderCosts?: number;
    _holdingCosts?: number;
    _revenue?: number;
    _sold?: number;
    _unmet?: number;
    _extraGained?: number;
    _demand?: number;
  };
}

interface AllocationRequest {
  playerId: string;
  amount: number;
}

function createOrderTotals(): Record<SupplierKey, number> {
  return SUPPLIER_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<SupplierKey, number>);
}

function createBooleanMap(): Record<SupplierKey, boolean> {
  return SUPPLIER_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as Record<SupplierKey, boolean>);
}

function allocateProportionally(requests: AllocationRequest[], capacity: number): Record<string, number> {
  const allocations: Record<string, number> = {};
  const totalRequested = requests.reduce((sum, request) => sum + request.amount, 0);

  if (capacity <= 0 || totalRequested <= 0) {
    return allocations;
  }

  if (totalRequested <= capacity) {
    for (const request of requests) {
      allocations[request.playerId] = request.amount;
    }
    return allocations;
  }

  const ranked = requests.map((request) => {
    const exactShare = (request.amount * capacity) / totalRequested;
    const baseAllocation = Math.floor(exactShare);
    return {
      ...request,
      baseAllocation,
      remainder: exactShare - baseAllocation,
    };
  });

  let allocatedSoFar = 0;
  for (const entry of ranked) {
    allocations[entry.playerId] = entry.baseAllocation;
    allocatedSoFar += entry.baseAllocation;
  }

  let remaining = capacity - allocatedSoFar;
  ranked.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.playerId.localeCompare(b.playerId);
  });

  for (const entry of ranked) {
    if (remaining <= 0) {
      break;
    }
    if ((allocations[entry.playerId] || 0) >= entry.amount) {
      continue;
    }
    allocations[entry.playerId] = (allocations[entry.playerId] || 0) + 1;
    remaining -= 1;
  }

  return allocations;
}

export function processRound(
  round: number,
  players: PlayerRoundData[],
  params: SessionParams,
  disruptionSchedule: DisruptionSchedule,
  currentActiveDisruptions: Record<Country, ActiveDisruption | null>,
  currentSupplierCapacities?: SupplierCapacityMap,
): {
  updatedStates: Record<string, Partial<PlayerStateDoc>>;
  newActiveDisruptions: Record<Country, ActiveDisruption | null>;
  newTotalMarketDemand: number;
  gameCompleted: boolean;
  newSupplierCapacities: SupplierCapacityMap;
} {
  for (const p of players) {
    let arrivals = 0;
    for (const country of ['china', 'mexico', 'us'] as const) {
      const transit = [...(p.state.transit[country] || [])];

      if (transit.length > 0) {
        arrivals += transit[transit.length - 1];
      }

      if (transit.length > 0) {
        transit.pop();
        transit.unshift(0);
      }

      p.state.transit[country] = transit;
    }
    p.state._arrivals = arrivals;
    p.state.inventory += arrivals;
  }

  const newActiveDisruptions: Record<Country, ActiveDisruption | null> = { ...currentActiveDisruptions };

  for (const country of ['china', 'mexico', 'us'] as const) {
    if (newActiveDisruptions[country] && round > newActiveDisruptions[country]!.endsAfterRound) {
      newActiveDisruptions[country] = null;
    }

    if (disruptionSchedule[country]?.includes(round)) {
      newActiveDisruptions[country] = {
        startRound: round,
        endsAfterRound: round + params.disruptionDuration - 1,
      };
    }
  }

  const allocated: Record<string, Record<SupplierKey, number>> = {};
  const cancelled: Record<string, Record<SupplierKey, boolean>> = {};
  const capacityLimited: Record<string, Record<SupplierKey, boolean>> = {};
  const submittedOrderTotals = getSubmittedOrderTotals(players.map((player) => player.orders));
  const currentCapacities = resolveSupplierCapacitiesForRound(
    currentSupplierCapacities,
    submittedOrderTotals,
    players.length,
    params,
    round,
  );
  const survivingOrderTotals = createOrderTotals();
  const preservePriorCapacity = createBooleanMap();
  const supplierHadCancellation = createBooleanMap();

  for (const p of players) {
    allocated[p.playerId] = {} as Record<SupplierKey, number>;
    cancelled[p.playerId] = {} as Record<SupplierKey, boolean>;
    capacityLimited[p.playerId] = {} as Record<SupplierKey, boolean>;

    for (const key of SUPPLIER_KEYS) {
      allocated[p.playerId][key] = 0;
      cancelled[p.playerId][key] = false;
      capacityLimited[p.playerId][key] = false;
    }
  }

  for (const key of SUPPLIER_KEYS) {
    const country = SUPPLIER_COUNTRY[key];
    const isReliable = SUPPLIER_RELIABLE[key];
    const disrupted = Boolean(newActiveDisruptions[country]);
    const requests: AllocationRequest[] = [];
    let cancelledUnits = 0;

    for (const p of players) {
      const myOrder = p.orders[key] || 0;
      if (myOrder <= 0) {
        continue;
      }

      if (disrupted) {
        cancelled[p.playerId][key] = true;
        continue;
      }

      if (!isReliable && Math.random() < params.unreliableCancellationChance) {
        cancelled[p.playerId][key] = true;
        supplierHadCancellation[key] = true;
        cancelledUnits += myOrder;
        continue;
      }

      requests.push({ playerId: p.playerId, amount: myOrder });
      survivingOrderTotals[key] += myOrder;
    }

    // Unreliable cancellations consume this round's supplier output instead of freeing it up.
    const allocableCapacity = Math.max(0, currentCapacities[key].actualCapacity - cancelledUnits);
    const allocationsForSupplier = allocateProportionally(requests, allocableCapacity);
    for (const request of requests) {
      const allocation = allocationsForSupplier[request.playerId] || 0;
      allocated[request.playerId][key] = allocation;
      capacityLimited[request.playerId][key] = allocation < request.amount;
    }

    preservePriorCapacity[key] =
      disrupted ||
      (
        submittedOrderTotals[key] > 0 &&
        survivingOrderTotals[key] === 0 &&
        supplierHadCancellation[key]
      );
  }

  for (const p of players) {
    let orderCosts = 0;

    for (const key of SUPPLIER_KEYS) {
      const alloc = allocated[p.playerId][key];
      if (alloc > 0) {
        const country = SUPPLIER_COUNTRY[key];
        const isUnreliable = !SUPPLIER_RELIABLE[key];
        // Players are charged only for units that actually ship this round.
        const unitCost = calculateUnitCost(
          params.baseCost[country],
          isUnreliable,
          params.unreliableCostModifier,
          alloc,
          params.volumeDiscountThresholds,
        );
        orderCosts += alloc * unitCost;
      }
    }

    p.state._orderCosts = orderCosts;
    p.state.cash -= orderCosts;
  }

  for (const p of players) {
    for (const key of SUPPLIER_KEYS) {
      const alloc = allocated[p.playerId][key];
      const country = SUPPLIER_COUNTRY[key];

      if (alloc > 0) {
        p.state.transit[country][0] += alloc;
      }

      const placedOrder = p.orders[key] || 0;
      const previousSupplierState = p.state.suppliers[key];
      const blockedByDisruption = Boolean(newActiveDisruptions[country]);
      p.state.suppliers[key] = {
        lastOrder: placedOrder,
        maxOrder: getNextSupplierMaxOrder(previousSupplierState, placedOrder, params, blockedByDisruption),
        totalOrdered: (previousSupplierState?.totalOrdered || 0) + alloc,
        active: (previousSupplierState?.active || false) || alloc > 0,
      };
    }
  }

  let totalUnmetPool = 0;
  const playerDemandResults: Record<string, { sold: number; unmet: number; extraGained: number }> = {};

  for (const p of players) {
    const demand = p.state.marketDemand;
    const sold = Math.min(p.state.inventory, demand);
    const unmet = demand - sold;

    p.state.inventory -= sold;
    playerDemandResults[p.playerId] = { sold, unmet, extraGained: 0 };
    totalUnmetPool += unmet;
  }

  if (totalUnmetPool > 0) {
    let remaining = totalUnmetPool;
    let iterations = 0;
    while (remaining > 0 && iterations < 10) {
      const withInventory = players.filter(p => p.state.inventory > 0);
      if (withInventory.length === 0) break;

      const perPlayer = Math.floor(remaining / withInventory.length);
      if (perPlayer === 0 && remaining > 0) {
        for (const p of withInventory) {
          if (remaining <= 0) break;
          const canFulfill = Math.min(1, p.state.inventory);
          if (canFulfill > 0) {
            p.state.inventory -= canFulfill;
            playerDemandResults[p.playerId].sold += canFulfill;
            playerDemandResults[p.playerId].extraGained += canFulfill;
            remaining -= canFulfill;
          }
        }
        break;
      }

      for (const p of withInventory) {
        const canFulfill = Math.min(perPlayer, p.state.inventory);
        p.state.inventory -= canFulfill;
        playerDemandResults[p.playerId].sold += canFulfill;
        playerDemandResults[p.playerId].extraGained += canFulfill;
        remaining -= canFulfill;
      }
      iterations++;
    }
  }

  let newTotalDemand = 0;
  for (const p of players) {
    const results = playerDemandResults[p.playerId];
    const holdingCosts = p.state.inventory * params.holdingCostPerUnit;
    const revenue = results.sold * params.sellingPrice;
    p.state.cash += revenue - holdingCosts;

    if (results.extraGained > 0) {
      p.state.marketDemand += Math.floor(results.extraGained * (1 - params.loyaltyPercent));
    }
    if (results.unmet > 0) {
      p.state.marketDemand -= Math.floor(results.unmet * (1 - params.loyaltyPercent));
      if (p.state.marketDemand < 0) p.state.marketDemand = 0;
    }

    p.state._holdingCosts = holdingCosts;
    p.state._revenue = revenue;
    p.state._sold = results.sold;
    p.state._unmet = results.unmet;
    p.state._extraGained = results.extraGained;
    p.state._demand = p.state.marketDemand;

    newTotalDemand += p.state.marketDemand;
  }

  const updatedStates: Record<string, Partial<PlayerStateDoc>> = {};
  const gameCompleted = round >= params.totalRounds;
  const nextCapacityRound = gameCompleted ? round : round + 1;
  const newSupplierCapacities = buildNextSupplierCapacities(
    currentCapacities,
    submittedOrderTotals,
    preservePriorCapacity,
    players.length,
    params,
    nextCapacityRound,
  );

  for (const p of players) {
    const profit = (p.state._revenue || 0) - (p.state._orderCosts || 0) - (p.state._holdingCosts || 0);

    const historyEntry: RoundHistoryEntry = {
      round,
      orders: { ...p.orders },
      allocated: { ...allocated[p.playerId] },
      cancelled: { ...cancelled[p.playerId] },
      capacityLimited: { ...capacityLimited[p.playerId] },
      arrivals: p.state._arrivals || 0,
      demand: p.state._demand || p.state.marketDemand,
      sold: p.state._sold || 0,
      unmetDemand: p.state._unmet || 0,
      extraDemandGained: p.state._extraGained || 0,
      revenue: p.state._revenue || 0,
      orderCosts: p.state._orderCosts || 0,
      holdingCosts: p.state._holdingCosts || 0,
      profit,
      inventory: p.state.inventory,
      cash: p.state.cash,
      marketDemand: p.state.marketDemand,
    };

    const roundHistory = [...(p.state.roundHistory || []), historyEntry];

    updatedStates[p.playerId] = {
      cash: p.state.cash,
      inventory: p.state.inventory,
      marketDemand: p.state.marketDemand,
      suppliers: p.state.suppliers,
      transit: p.state.transit,
      roundHistory,
    };

    delete p.state._arrivals;
    delete p.state._orderCosts;
    delete p.state._holdingCosts;
    delete p.state._revenue;
    delete p.state._sold;
    delete p.state._unmet;
    delete p.state._extraGained;
    delete p.state._demand;
  }

  return {
    updatedStates,
    newActiveDisruptions,
    newTotalMarketDemand: newTotalDemand,
    gameCompleted,
    newSupplierCapacities,
  };
}
