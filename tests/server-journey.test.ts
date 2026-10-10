import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightOperations } from '../server/src/systems/operations.js';
import { FlightGame } from '../server/src/systems/game.js';
import { BOARDING_DOCUMENTS, BOARDING_ENTRANCE, SAFETY_INSTRUCTIONS, type SafetyChallenge } from '../shared/protocol.js';
import { FLIGHT_CONTROL_STATION, SAFETY_DEMO_STATION } from '../shared/world.js';

const stateOf = (game: FlightGame) => game as unknown as { players: Map<string, { x: number; z: number; role: string; detained: boolean }>; operations: FlightOperations; story: { state: { stage: string; objectives: { current: number; target: number }[] }; ready: boolean }; };
function harness(count = 1, training = true) {
  let now = 0;
  const events: { id: string; type: string; payload: any }[] = [];
  const game = new FlightGame('JOURNEY', training, (id, type, payload) => events.push({ id, type, payload }), () => now);
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  game.handle(ids[0], 'start', {});
  const step = (seconds: number) => { for (let elapsed = 0; elapsed < seconds; elapsed += .05) { now += 50; game.step(.05); } };
  const place = (id: string, x: number, z: number) => Object.assign(stateOf(game).players.get(id)!, { x, z });
  const board = (id: string) => { place(id, BOARDING_DOCUMENTS.x, BOARDING_DOCUMENTS.z); game.handle(id, 'boardingAction', { kind: 'documents' }); place(id, BOARDING_ENTRANCE.x, BOARDING_ENTRANCE.z); game.handle(id, 'boardingAction', { kind: 'board' }); };
  return { game, ids, events, step, place, board };
}

test('training must collect documents, board and finish real departure duties before pilot takeoff', () => {
  const { game, ids: [id], events, step, place, board } = harness();
  assert.equal(game.snapshot().operations.stage, 'boarding'); assert.equal(game.snapshot().flight.altitude, 0);
  board(id); place(id, FLIGHT_CONTROL_STATION.x, FLIGHT_CONTROL_STATION.z);
  game.handle(id, 'startTakeoff', {}); assert.equal(game.snapshot().operations.stage, 'boarding');
  assert.match(events.at(-1)!.payload.message, /departure checks/);
  place(id, -1.25, 15.5); game.handle(id, 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' });
  for (let i = 0; i < 65; i++) { game.handle(id, 'maintainAction', {}); step(.05); }
  step(1);
  const standing = game.snapshot().npcs.find(npc => npc.needsSeat)!; assert.ok(standing);
  place(id, 0, standing.z); game.handle(id, 'beginAction', { kind: 'guide-passenger', targetId: standing.id });
  for (let i = 0; i < 55; i++) { game.handle(id, 'maintainAction', {}); step(.05); }
  step(8);
  place(id, SAFETY_DEMO_STATION.x, SAFETY_DEMO_STATION.z); game.handle(id, 'beginSafety', {});
  const challenge = [...events].reverse().find(event => event.type === 'safetyChallenge')!.payload as SafetyChallenge;
  game.handle(id, 'submitSafety', { token: challenge.token, order: SAFETY_INSTRUCTIONS.map(card => card.id) }); step(27);
  assert.equal(game.snapshot().safety.status, 'complete'); assert.equal(game.snapshot().story.stage, 'departure', 'boarding cannot skip takeoff into cruise');
  place(id, FLIGHT_CONTROL_STATION.x, FLIGHT_CONTROL_STATION.z); game.handle(id, 'startTakeoff', {});
  assert.equal(game.snapshot().operations.stage, 'takeoff');
  for (let i = 0; i < 800 && game.snapshot().operations.stage === 'takeoff'; i++) {
    const op = game.snapshot().operations;
    game.handle(id, 'aircraftControl', { throttle: 1, pitch: op.airspeed >= 135 ? .42 : 0, roll: 0, gearDown: op.altitude < 50, brakes: false }); step(.05);
  }
  assert.equal(game.snapshot().operations.stage, 'cruise'); assert.equal(game.snapshot().story.stage, 'service'); assert.equal(game.snapshot().phase, 'playing');
  step(5); assert.ok(game.snapshot().npcs.every(npc => !npc.needsSeat), 'cruise handover resets departure aisle activity timer');
  // Cruise chapter mechanics have independent story tests. Arrange the final
  // completed chapter to verify that it unlocks actual landing, not victory.
  stateOf(game).story.state.stage = 'approach'; stateOf(game).story.state.objectives = [];
  step(.1); assert.equal(game.snapshot().operations.landingReady, true); assert.equal(game.snapshot().winner, null);
  place(id, FLIGHT_CONTROL_STATION.x, FLIGHT_CONTROL_STATION.z); game.handle(id, 'startLanding', {});
  assert.equal(game.snapshot().operations.stage, 'landing');
  for (let i = 0; i < 1400 && game.snapshot().operations.stage === 'landing'; i++) {
    const grounded = game.snapshot().operations.altitude === 0;
    game.handle(id, 'aircraftControl', { throttle: grounded ? 0 : .32, pitch: grounded ? 0 : -.12, roll: 0, gearDown: true, brakes: grounded }); step(.05);
  }
  assert.equal(game.snapshot().operations.stage, 'arrived'); assert.equal(game.snapshot().winner, 'crew');
});

test('manual controller rejects nonfinite inputs and a missed rotation crashes after runway length', () => {
  const flight = new FlightOperations(); flight.reset(['pilot']); flight.startTakeoff('pilot');
  assert.equal(flight.control('pilot', 0, { throttle: NaN, pitch: 0, roll: 0, gearDown: true, brakes: false }), false);
  for (let now = 0; now < 80_000 && flight.stage !== 'crashed'; now += 50) {
    flight.control('pilot', now, { throttle: 1, pitch: 0, roll: 0, gearDown: true, brakes: false }); flight.step(.05, now, () => true);
  }
  assert.equal(flight.stage, 'crashed'); assert.ok(flight.snapshot().crashReason.length > 0);
  for (let i = 0; i < 170; i++) flight.step(.05, 80_000 + i * 50, () => false);
  assert.equal(flight.snapshot().crashProgress, 1);
});

test('bomb is private and single use; disarming requires fresh nearby authorized holds', () => {
  const { game, ids, step, place, board } = harness(6, false); ids.forEach(board); step(15);
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  const engineer = game.snapshot().players.find(player => player.role === 'Engineer')!.id;
  const marshal = game.snapshot().players.find(player => player.role === 'Air Marshal')!.id;
  const defender = engineer === sab ? marshal : engineer;
  place(sab, 0, 1); game.handle(sab, 'equipTool', { tool: 'bomb' }); step(.65); game.handle(sab, 'useTool', {});
  assert.ok(game.snapshot().operations.bomb); assert.deepEqual(game.getSecret(sab).inventory, ['knife', 'rope']);
  assert.equal(JSON.stringify(game.snapshot()).includes('inventory'), false);
  place(defender, 0, 1); game.handle(defender, 'disarmBomb', { phase: 'begin' }); step(1);
  assert.ok(game.snapshot().operations.bomb!.disarmProgress < .1, 'expired hold stops progressing');
  game.handle(defender, 'disarmBomb', { phase: 'begin' });
  for (let i = 0; i < 125; i++) { game.handle(defender, 'disarmBomb', { phase: 'maintain' }); step(.05); }
  assert.equal(game.snapshot().operations.bomb, null);
  game.handle(sab, 'equipTool', { tool: 'bomb' }); assert.equal(game.snapshot().players.find(p => p.id === sab)!.equippedTool, null);
});

test('Captain attack and timed device failure enter durable ocean crash with post-round progression', () => {
  for (const method of ['pilot', 'bomb'] as const) {
    const { game, ids, step, place, board } = harness(3, false); ids.forEach(board); step(15);
    const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
    if (method === 'pilot') { place(sab, -.6, -11.05); game.handle(sab, 'equipTool', { tool: 'knife' }); step(.65); game.handle(sab, 'killNpc', { npcId: 'pilot' }); }
    else { place(sab, 0, 1); game.handle(sab, 'equipTool', { tool: 'bomb' }); step(.65); game.handle(sab, 'useTool', {}); step(61); }
    assert.equal(game.snapshot().operations.stage, 'crashed'); assert.equal(game.snapshot().phase, 'ended'); assert.equal(game.snapshot().winner, 'saboteur');
    step(8); assert.equal(game.snapshot().operations.crashProgress, 1);
    game.handle(ids[0], 'restart', {}); assert.equal(game.snapshot().operations.stage, 'boarding'); assert.equal(game.snapshot().operations.bomb, null); assert.ok(game.snapshot().operations.roster.every(member => !member.boarded && !member.documentsReceived));
  }
});

test('rope restraint blocks movement, then fresh Cabin Crew rescue releases the player', () => {
  const { game, ids, step, place, board } = harness(6, false); ids.forEach(board); step(11);
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  const crew = game.snapshot().players.find(player => player.role === 'Cabin Crew')!.id;
  const marshal = game.snapshot().players.find(player => player.role === 'Air Marshal')!.id;
  const rescuer = crew === sab ? marshal : crew;
  const victim = ids.find(id => id !== sab && id !== rescuer)!;
  for (const id of [sab, rescuer, victim]) place(id, 0, 1);
  game.handle(sab, 'equipTool', { tool: 'rope' }); step(.65); game.handle(sab, 'useTool', { targetId: victim });
  assert.ok(game.snapshot().operations.restraints[victim]); const before = game.snapshot().players.find(p => p.id === victim)!;
  game.handle(victim, 'move', { dx: 0, dz: 1, yaw: 0 }); step(.5);
  assert.equal(game.snapshot().players.find(p => p.id === victim)!.z, before.z);
  game.handle(rescuer, 'releaseRestraint', { phase: 'begin', targetId: victim });
  for (let i = 0; i < 65; i++) { game.handle(rescuer, 'releaseRestraint', { phase: 'maintain', targetId: victim }); step(.05); }
  assert.equal(game.snapshot().operations.restraints[victim], undefined);
});

test('unavailable security specialists get reserve device counterplay after correct detention', () => {
  const { game, ids, step, place, board } = harness(3, false); ids.forEach(board); step(16);
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  const engineer = game.snapshot().players.find(player => player.role === 'Engineer')!;
  place(sab, 0, 1); game.handle(sab, 'equipTool', { tool: 'bomb' }); step(.65); game.handle(sab, 'useTool', {});
  stateOf(game).players.get(engineer.id)!.detained = true;
  step(19); assert.ok(game.snapshot().operations.bomb, 'already absent Marshal cannot shorten the combined specialist absence grace');
  step(2); assert.equal(game.snapshot().operations.bomb, null, 'reserve covers missing specialist instead of guaranteeing explosion');
  assert.ok(game.snapshot().chat.some(message => /disarmed the cabin device/.test(message.text)));
});
