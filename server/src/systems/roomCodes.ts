import { randomInt } from 'node:crypto';

// This deployment has one Colyseus process. Reserve synchronously before room
// construction yields, so simultaneous create requests cannot share a code.
const reserved = new Set<string>();
export function reserveRoomCode(): string {
  const start = randomInt(9000);
  for (let i = 0; i < 9000; i++) {
    const code = String(1000 + (start + i) % 9000);
    if (!reserved.has(code)) { reserved.add(code); return code; }
  }
  throw new Error('All flight codes are in use. Please try again shortly.');
}
export function releaseRoomCode(code: string) { reserved.delete(code); }
