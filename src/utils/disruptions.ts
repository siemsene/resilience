import type { Country, DisruptionSchedule } from '../types';

const CHINA_MIN_GAP = 6;
const CHINA_FIRST_ROUNDS = [3, 4];
const NO_DISRUPTION_LAST_N_ROUNDS = 5;

export function generateDisruptionSchedule(
  totalRounds: number,
  disruptionsPerCountry: Record<Country, number>,
  disruptionDuration: number,
): DisruptionSchedule {
  const schedule: DisruptionSchedule = { china: [], mexico: [], us: [] };
  const lastAllowed = totalRounds - NO_DISRUPTION_LAST_N_ROUNDS;

  // --- China ---
  const chinaCount = disruptionsPerCountry.china;
  const chinaRounds: number[] = [];

  if (chinaCount > 0) {
    // First disruption: round 3 or 4 with equal probability (if within allowed range)
    const validFirst = CHINA_FIRST_ROUNDS.filter(r => r <= lastAllowed);
    if (validFirst.length > 0) {
      chinaRounds.push(validFirst[Math.floor(Math.random() * validFirst.length)]);

      // Additional disruptions: at least CHINA_MIN_GAP rounds after the most recent one
      for (let i = 1; i < chinaCount; i++) {
        const earliest = chinaRounds[chinaRounds.length - 1] + CHINA_MIN_GAP;
        if (earliest > lastAllowed) break;
        chinaRounds.push(earliest + Math.floor(Math.random() * (lastAllowed - earliest + 1)));
      }
    }
  }

  schedule.china = chinaRounds;

  // Compute rounds occupied by China disruptions
  const chinaOccupied = new Set<number>();
  for (const c of chinaRounds) {
    for (let r = c; r < c + disruptionDuration && r <= totalRounds; r++) {
      chinaOccupied.add(r);
    }
  }

  // --- Mexico & US: cannot overlap with China, and not with themselves ---
  for (const country of ['mexico', 'us'] as const) {
    const count = disruptionsPerCountry[country];
    if (count <= 0) continue;

    const occupied = new Set<number>(chinaOccupied);
    const rounds: number[] = [];

    for (let i = 0; i < count; i++) {
      // Build list of valid start rounds: within allowed range, no overlap with occupied rounds
      const available: number[] = [];
      for (let r = 1; r <= lastAllowed; r++) {
        let overlaps = false;
        for (let d = 0; d < disruptionDuration; d++) {
          if (occupied.has(r + d)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) available.push(r);
      }

      if (available.length === 0) break;

      const chosen = available[Math.floor(Math.random() * available.length)];
      rounds.push(chosen);

      // Mark rounds used by this disruption
      for (let d = 0; d < disruptionDuration; d++) {
        if (chosen + d <= totalRounds) occupied.add(chosen + d);
      }
    }

    schedule[country] = rounds.sort((a, b) => a - b);
  }

  return schedule;
}

export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
