import type { Country, DisruptionSchedule } from '../types';

export function generateDisruptionSchedule(
  totalRounds: number,
  disruptionsPerCountry: Record<Country, number>,
): DisruptionSchedule {
  const schedule: DisruptionSchedule = { china: [], mexico: [], us: [] };

  for (const country of ['china', 'mexico', 'us'] as Country[]) {
    const count = disruptionsPerCountry[country];
    if (count <= 0) continue;

    const blockSize = Math.floor(totalRounds / count);
    const rounds: number[] = [];

    for (let i = 0; i < count; i++) {
      const blockStart = i * blockSize + 1;
      const blockEnd = Math.min((i + 1) * blockSize, totalRounds);
      const round = blockStart + Math.floor(Math.random() * (blockEnd - blockStart + 1));
      rounds.push(round);
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
