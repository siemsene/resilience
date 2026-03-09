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

export interface PlayerInfo {
  name: string;
  joinedAt: number;
  connected: boolean;
}

export interface SupplierState {
  lastOrder: number;
  maxOrder: number;
  totalOrdered: number;
  active: boolean;
}

export interface RoundHistoryEntry {
  round: number;
  orders: Record<SupplierKey, number>;
  allocated: Record<SupplierKey, number>;
  cancelled: Record<SupplierKey, boolean>;
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
  status: SessionStatus;
  createdAt: number;
  expiresAt: number;
  params: SessionParams;
  disruptionSchedule: DisruptionSchedule;
  activeDisruptions: Record<Country, ActiveDisruption | null>;
  players: Record<string, PlayerInfo>;
  currentRound: number;
  currentPhase: GamePhase;
  submittedPlayers: string[];
  totalMarketDemand: number;
}

export type OrderMap = Record<SupplierKey, number>;
