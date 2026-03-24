export type Country = 'china' | 'mexico' | 'us';
export type SupplierKey = 'chinaReliable' | 'chinaUnreliable' | 'mexReliable' | 'mexUnreliable' | 'usReliable' | 'usUnreliable';

export const SUPPLIER_KEYS: SupplierKey[] = [
  'chinaReliable', 'chinaUnreliable',
  'mexReliable', 'mexUnreliable',
  'usReliable', 'usUnreliable',
];

export const SUPPLIER_COUNTRY: Record<SupplierKey, Country> = {
  chinaReliable: 'china', chinaUnreliable: 'china',
  mexReliable: 'mexico', mexUnreliable: 'mexico',
  usReliable: 'us', usUnreliable: 'us',
};

export const SUPPLIER_RELIABLE: Record<SupplierKey, boolean> = {
  chinaReliable: true, chinaUnreliable: false,
  mexReliable: true, mexUnreliable: false,
  usReliable: true, usUnreliable: false,
};

export const TRANSIT_TURNS: Record<Country, number> = {
  china: 4,
  mexico: 2,
  us: 1,
};

export interface SessionParams {
  totalRounds: number;
  startingCash: number;
  startingDemand: number;
  sellingPrice: number;
  holdingCostPerUnit: number;
  baseCost: Record<Country, number>;
  unreliableCostModifier: number;
  volumeDiscountThresholds: { threshold: number; discount: number }[];
  maxCapacityPercent: Record<Country, number>;
  transitTurns: Record<Country, number>;
  unreliableCancellationChance: number;
  loyaltyPercent: number;
  disruptionDuration: number;
  disruptionsPerCountry: Record<Country, number>;
  maxNewSupplierOrder: number;
  maxOrderIncreasePercent: number;
  minimumOrder: number;
  supplierCapacityTargetMultiplier: number;
  supplierCapacityPriorWeight: number;
  supplierCapacityTargetWeight: number;
  supplierCapacityMinPerPlayer: number;
  roundTimeLimit: number;
  disruptionBonusTime: number;
}

export interface ActiveDisruption {
  startRound: number;
  endsAfterRound: number;
}

export interface DisruptionSchedule {
  china: number[];
  mexico: number[];
  us: number[];
}

export interface SupplierState {
  lastOrder: number;
  maxOrder: number;
  totalOrdered: number;
  active: boolean;
}

export interface SupplierCapacityState {
  actualCapacity: number;
  targetCapacity: number;
  lastRoundOrders: number;
  capacityRound: number;
}

export type SupplierCapacityMap = Record<SupplierKey, SupplierCapacityState>;

export interface RoundHistoryEntry {
  round: number;
  orders: Record<SupplierKey, number>;
  allocated: Record<SupplierKey, number>;
  cancelled: Record<SupplierKey, boolean>;
  capacityLimited: Record<SupplierKey, boolean>;
  arrivals: number;
  demand: number;
  sold: number;
  unmetDemand: number;
  extraDemandGained: number;
  revenue: number;
  orderCosts: number;
  holdingCosts: number;
  profit: number;
  inventory: number;
  cash: number;
  marketDemand: number;
}

export interface InstructorRecord {
  uid: string;
  email: string;
  displayName: string;
  institution: string;
  status: InstructorStatus;
  appliedAt: number;
  reviewedAt?: number;
}

export type InstructorStatus = 'pending' | 'approved' | 'denied' | 'revoked';
export type SessionStatus = 'lobby' | 'setup' | 'active' | 'completed' | 'expired';
export type GamePhase = 'ordering' | 'processing' | 'results';

export interface SessionPublicState {
  sessionId: string;
  status: SessionStatus;
  currentRound: number;
  currentPhase: GamePhase;
  activeDisruptions: Record<Country, ActiveDisruption | null>;
  submittedCount: number;
  playerCount: number;
  totalMarketDemand: number;
  resultsRound?: number;
  resultsConfirmedCount?: number;
  roundDeadline?: number;
}

export interface SessionInstructorState {
  sessionId: string;
  submittedPlayerIds: string[];
  supplierCapacities?: SupplierCapacityMap;
  resultsRound?: number;
  resultsConfirmedPlayerIds?: string[];
  updatedAt: number;
}

export interface SessionMemberDoc {
  playerId: string;
  playerName: string;
  joinedAt?: number;
  reconnectedAt?: number;
  removedAt?: number;
  removedByInstructor?: boolean;
  removedPlayerId?: string;
  removedPlayerName?: string;
}

export interface SessionPlayerDoc {
  playerId: string;
  sessionId: string;
  playerName: string;
  nameKey: string;
  authUid: string;
  connected: boolean;
  joinedAt: number;
  currentCash: number;
  currentInventory: number;
  currentDemand: number;
}

export interface PlayerStateDoc {
  playerId: string;
  sessionId: string;
  playerName: string;
  cash: number;
  inventory: number;
  marketDemand: number;
  suppliers: Record<SupplierKey, SupplierState>;
  transit: TransitState;
  roundHistory: RoundHistoryEntry[];
  lastSubmittedRound?: number;
  lastConfirmedResultsRound?: number;
}

export interface TransitState {
  china: number[];
  mexico: number[];
  us: number[];
}

export interface SessionDoc {
  id: string;
  instructorUid: string;
  sessionCode: string;
  sessionName: string;
  createdAt: number;
  expiresAt: number;
  params: SessionParams;
  disruptionSchedule: DisruptionSchedule;
  status: SessionStatus;
  currentRound: number;
  currentPhase: GamePhase;
  activeDisruptions: Record<Country, ActiveDisruption | null>;
  playerCount: number;
  submittedCount: number;
  totalMarketDemand: number;
  resultsRound?: number;
  resultsConfirmedCount?: number;
  roundDeadline?: number;
}

export type OrderMap = Record<SupplierKey, number>;
