import { WALK_SPEED } from './world.js';

export const TERMINAL_WALK_SPEED = WALK_SPEED;
export const TERMINAL_BOUNDS = Object.freeze({ minX: -5, maxX: 5, minZ: 4, maxZ: 14 });
export const TERMINAL_PREDICTION_SNAP_DISTANCE = .85;

export interface TerminalPosition { x: number; z: number; }
export interface TerminalReconciliation extends TerminalPosition { snapped: boolean; }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finitePosition(position: TerminalPosition): TerminalPosition {
  return {
    x: Number.isFinite(position.x) ? position.x : 0,
    z: Number.isFinite(position.z) ? position.z : 11,
  };
}

/** Shared terminal simulation: no cabin furniture collisions, bounded metre
 * coordinates, and the same normalized 3.1m/s movement on client and server. */
export function moveTerminal(x: number, z: number, dx: number, dz: number, seconds: number): TerminalPosition {
  const position = finitePosition({ x, z });
  const delta = Number.isFinite(seconds) ? clamp(seconds, 0, .1) : 0;
  const directionX = Number.isFinite(dx) ? dx : 0;
  const directionZ = Number.isFinite(dz) ? dz : 0;
  // Inputs smaller than one retain analog speed; diagonal/oversized input can
  // never move faster than a full forward input.
  const scale = TERMINAL_WALK_SPEED * delta / Math.max(1, Math.hypot(directionX, directionZ));
  return {
    x: clamp(position.x + directionX * scale, TERMINAL_BOUNDS.minX, TERMINAL_BOUNDS.maxX),
    z: clamp(position.z + directionZ * scale, TERMINAL_BOUNDS.minZ, TERMINAL_BOUNDS.maxZ),
  };
}

/** Reconcile visual prediction without rewinding it at every 10Hz snapshot.
 * The protocol has no acknowledged input sequence, so a small moving lead is
 * preserved, a stopped player settles smoothly, and a large discrepancy snaps.
 * Reset prediction separately when the room, stage, or spawn changes. */
export function reconcileTerminalPosition(
  predicted: TerminalPosition,
  authoritative: TerminalPosition,
  seconds: number,
  moving: boolean,
): TerminalReconciliation {
  const server = finitePosition(authoritative);
  const invalidPrediction = !Number.isFinite(predicted.x) || !Number.isFinite(predicted.z);
  if (invalidPrediction || Math.hypot(predicted.x - server.x, predicted.z - server.z) > TERMINAL_PREDICTION_SNAP_DISTANCE) {
    return { ...server, snapped: true };
  }
  if (moving) return { ...predicted, snapped: false };
  const delta = Number.isFinite(seconds) ? clamp(seconds, 0, .1) : 0;
  const blend = 1 - Math.exp(-12 * delta);
  return {
    x: predicted.x + (server.x - predicted.x) * blend,
    z: predicted.z + (server.z - predicted.z) * blend,
    snapped: false,
  };
}
