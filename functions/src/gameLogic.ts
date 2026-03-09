import {
  SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE,
  SupplierKey, Country, OrderMap, SessionParams, ActiveDisruption,
  DisruptionSchedule, RoundHistoryEntry, PlayerStateDoc,
} from './types';
import { getCurrentSupplierMaxOrder, getNextSupplierMaxOrder } from './orderLimits';

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

  // Apply volume discount (highest qualifying tier)
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

export function processRound(
  round: number,
  players: PlayerRoundData[],
  params: SessionParams,
  disruptionSchedule: DisruptionSchedule,
  currentActiveDisruptions: Record<Country, ActiveDisruption | null>,
): {
  updatedStates: Record<string, Partial<PlayerStateDoc>>;
  newActiveDisruptions: Record<Country, ActiveDisruption | null>;
  newTotalMarketDemand: number;
  gameCompleted: boolean;
} {
  // --- Phase 1: Movement ---
  // Shift transit arrays toward US; last box arrives into inventory
  for (const p of players) {
    let arrivals = 0;
    for (const country of ['china', 'mexico', 'us'] as const) {
      const transit = [...(p.state.transit[country] || [])];

      // Last box arrives
      if (transit.length > 0) {
        arrivals += transit[transit.length - 1];
      }

      // Shift: remove last, insert 0 at front
      if (transit.length > 0) {
        transit.pop();
        transit.unshift(0);
      }

      p.state.transit[country] = transit;
    }
    p.state._arrivals = arrivals;
    p.state.inventory += arrivals;
  }

  // --- Phase 2: Disruptions ---
  const newActiveDisruptions: Record<Country, ActiveDisruption | null> = { ...currentActiveDisruptions };

  for (const country of ['china', 'mexico', 'us'] as const) {
    // Clear expired disruptions
    if (newActiveDisruptions[country] && round > newActiveDisruptions[country]!.endsAfterRound) {
      newActiveDisruptions[country] = null;
    }

    // Start new disruptions
    if (disruptionSchedule[country]?.includes(round)) {
      newActiveDisruptions[country] = {
        startRound: round,
        endsAfterRound: round + params.disruptionDuration - 1,
      };
    }
  }

  // --- Phase 3: Allocation ---
  const allocated: Record<string, Record<SupplierKey, number>> = {};
  const cancelled: Record<string, Record<SupplierKey, boolean>> = {};

  for (const p of players) {
    allocated[p.playerId] = {} as Record<SupplierKey, number>;
    cancelled[p.playerId] = {} as Record<SupplierKey, boolean>;

    for (const key of SUPPLIER_KEYS) {
      const country = SUPPLIER_COUNTRY[key];
      const isReliable = SUPPLIER_RELIABLE[key];
      const myOrder = p.orders[key] || 0;

      // Check disruption — orders to disrupted countries are blocked
      if (newActiveDisruptions[country]) {
        allocated[p.playerId][key] = 0;
        cancelled[p.playerId][key] = true;
        continue;
      }

      let alloc = myOrder;

      // Unreliable supplier cancellation roll
      let wasCancelled = false;
      if (!isReliable && alloc > 0) {
        if (Math.random() < params.unreliableCancellationChance) {
          alloc = 0;
          wasCancelled = true;
        }
      }

      allocated[p.playerId][key] = alloc;
      cancelled[p.playerId][key] = wasCancelled;
    }
  }

  // --- Phase 4: Order costs ---
  for (const p of players) {
    let orderCosts = 0;

    for (const key of SUPPLIER_KEYS) {
      const alloc = allocated[p.playerId][key];
      if (alloc > 0) {
        const country = SUPPLIER_COUNTRY[key];
        const isUnreliable = !SUPPLIER_RELIABLE[key];
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

  // --- Phase 5: Place shipments ---
  for (const p of players) {
    for (const key of SUPPLIER_KEYS) {
      const alloc = allocated[p.playerId][key];
      const country = SUPPLIER_COUNTRY[key];

      if (alloc > 0) {
        // Place at position 0 (start of transit)
        p.state.transit[country][0] += alloc;
      }

      // Update supplier state
      const placedOrder = p.orders[key] || 0;
      const previousSupplierState = p.state.suppliers[key];
      const previousMaxOrder = getCurrentSupplierMaxOrder(previousSupplierState);
      const blockedByDisruption = Boolean(newActiveDisruptions[country]);
      p.state.suppliers[key] = {
        lastOrder: placedOrder,
        maxOrder: getNextSupplierMaxOrder(previousMaxOrder, placedOrder, blockedByDisruption),
        totalOrdered: (previousSupplierState?.totalOrdered || 0) + alloc,
        active: (previousSupplierState?.active || false) || alloc > 0,
      };
    }
  }

  // --- Phase 6: Demand ---
  // Each player fulfills their own marketDemand from inventory
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

  // Redistribute unmet demand uniformly to players with remaining inventory
  if (totalUnmetPool > 0) {
    let remaining = totalUnmetPool;
    let iterations = 0;
    while (remaining > 0 && iterations < 10) {
      const withInventory = players.filter(p => p.state.inventory > 0);
      if (withInventory.length === 0) break;

      const perPlayer = Math.floor(remaining / withInventory.length);
      if (perPlayer === 0 && remaining > 0) {
        // Distribute remainder 1 by 1
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

  // Apply loyalty adjustments, end-of-turn holding costs, and revenue
  let newTotalDemand = 0;
  for (const p of players) {
    const results = playerDemandResults[p.playerId];
    const holdingCosts = p.state.inventory * params.holdingCostPerUnit;
    const revenue = results.sold * params.sellingPrice;
    p.state.cash += revenue - holdingCosts;

    // Loyalty: adjust marketDemand
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

  // --- Build updated states ---
  const updatedStates: Record<string, Partial<PlayerStateDoc>> = {};
  const gameCompleted = round >= params.totalRounds;

  for (const p of players) {
    const profit = (p.state._revenue || 0) - (p.state._orderCosts || 0) - (p.state._holdingCosts || 0);

    const historyEntry: RoundHistoryEntry = {
      round,
      orders: { ...p.orders },
      allocated: { ...allocated[p.playerId] },
      cancelled: { ...cancelled[p.playerId] },
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

    // Clean up temp fields
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
  };
}
