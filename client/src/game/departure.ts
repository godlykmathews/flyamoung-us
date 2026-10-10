import type { Phase } from '../../../shared/protocol';

export const DEPARTURE_DURATION_MS = 8000;

export type DepartureSnapshot = { roomId: string; phase: Phase };

/** A departure belongs to the server's start of a round, never a meeting resume. */
export function shouldPlayDeparture(
  previous: DepartureSnapshot | null,
  current: DepartureSnapshot | null,
): boolean {
  return previous !== null
    && current !== null
    && previous.roomId === current.roomId
    && previous.phase === 'lobby'
    && current.phase === 'playing';
}
