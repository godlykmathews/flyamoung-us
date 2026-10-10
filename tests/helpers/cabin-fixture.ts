import type { FlightGame } from '../../server/src/systems/game.js';
import type { OperationsState, Player } from '../../shared/protocol.js';

/** Arrange already-boarded cruise seats for focused legacy cabin-system tests.
 * No production message or constructor flag bypasses the new flight lifecycle.
 * Boarding/manual-flight behavior is tested separately through real commands.
 */
export function useCabinFixture(game: FlightGame) {
 const handle = game.handle.bind(game);
 game.handle = (id, type, payload) => {
  const before = game.currentPhase;
  handle(id, type, payload);
  if (type !== 'start' || before !== 'lobby' || game.currentPhase !== 'playing') return;
  const internals = game as unknown as { operations: { state: OperationsState }; players: Map<string, Player> };
  const state = internals.operations.state;
  state.stage = 'cruise'; state.altitude = 34000; state.airspeed = 465; state.gearDown = false; state.brakes = false;
  for (const entry of state.roster) { entry.documentsReceived = true; entry.boarded = true; }
  let index = 0;
  for (const player of internals.players.values()) { player.x = -.35; player.z = 7.3 - index++ * .95; player.yaw = 0; }
 };
}
