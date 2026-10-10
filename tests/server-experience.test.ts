import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperienceSimulation } from '../server/src/systems/experience.js';
import { CabinSimulation } from '../server/src/systems/cabin.js';
import { FlightGame } from '../server/src/systems/game.js';
import { useCabinFixture } from './helpers/cabin-fixture.js';
import { EXPERIENCE_ACTION_DURATIONS, type ExperienceActionKind, type ServiceItem, type Player, type Role } from '../shared/protocol.js';
import { NPC_PASSENGER_SEATS, canStand } from '../shared/world.js';

function createHarness(count = 1) {
  let now = 0;
  const errors: Array<{ id: string; message: string }> = [];
  const game = new FlightGame('0420', count === 1, (id, type, payload) => { if (type === 'error') errors.push({ id, message: (payload as { message: string }).message }); }, () => now);
  useCabinFixture(game);
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  game.handle(ids[0], 'start', {});
  const step = (ms: number, frame?: () => void) => { for (let elapsed = 0; elapsed < ms; elapsed += 50) { frame?.(); now += 50; game.step(.05); } };
  const me = (id = ids[0]) => game.snapshot().players.find(player => player.id === id)!;
  const state = () => game.snapshot().experience;
  function walk(id: string, x: number, z: number) {
    for (let guard = 0; Math.hypot(me(id).x - x, me(id).z - z) > .07; guard++) {
      assert.ok(guard < 700, `Blocked at ${me(id).x},${me(id).z} walking to ${x},${z}`);
      const dx = x - me(id).x, dz = z - me(id).z, length = Math.max(.3, Math.hypot(dx, dz));
      game.handle(id, 'move', { dx: dx / length, dz: dz / length, yaw: 0 }); step(50);
    }
    game.handle(id, 'move', { dx: 0, dz: 0, yaw: 0 });
  }
  function hold(id: string, kind: ExperienceActionKind, targetId: string) {
    game.handle(id, 'experienceAction', { phase: 'begin', kind, targetId });
    step(EXPERIENCE_ACTION_DURATIONS[kind] * 1000 + 100, () => game.handle(id, 'experienceAction', { phase: 'maintain' }));
  }
  function reject(id: string, type: string, payload: unknown) { const n = errors.length; game.handle(id, type, payload); assert.equal(errors.length, n + 1, `${type} should reject`); }
  return { game, ids, step, me, state, walk, hold, reject, errors };
}

function harness(count = 1, loyalRole?: Role) {
  for (let i = 0; i < 100; i++) {
    const h = createHarness(count);
    if (!loyalRole || h.game.getSecret(h.game.snapshot().players.find(p => p.role === loyalRole)!.id).allegiance === 'crew') return h;
  }
  throw new Error('Could not assign the required loyal role fixture');
}

test('incident drills are training-only and cannot stack or reset active incident countdowns', () => {
  const multiplayer = harness(3);
  for (const id of multiplayer.ids) for (const kind of ['decompression', 'smoke', 'medical', 'weather']) multiplayer.reject(id, 'incidentDrill', { kind });
  assert.equal(multiplayer.state().incident, 'none');
  const h = harness(), id = h.ids[0];
  h.game.handle(id, 'incidentDrill', { kind: 'decompression' }); h.step(1000);
  const remaining = h.state().remaining;
  h.reject(id, 'incidentDrill', { kind: 'smoke' }); h.reject(id, 'incidentDrill', { kind: 'decompression' });
  assert.equal(h.state().remaining, remaining); assert.equal(h.state().masksDeployed, true);
  h.reject(id, 'incidentDrill', { kind: '__proto__' });
});

test('mask and pressure repair require proximity, a mask, fresh held input and real elapsed time', () => {
  const h = harness(), id = h.ids[0]; h.game.handle(id, 'incidentDrill', { kind: 'decompression' });
  h.reject(id, 'experienceAction', { phase: 'begin', kind: 'repair-pressure', targetId: 'pressure' });
  h.game.handle(id, 'experienceAction', { phase: 'begin', kind: 'use-mask', targetId: id }); h.step(800);
  assert.equal(h.state().players[id].oxygenMask, false); assert.equal(h.state().actions.length, 0, 'stale keepalive cancels');
  h.hold(id, 'use-mask', id); assert.equal(h.state().players[id].oxygenMask, true);
  h.walk(id, 0, 9.4); h.walk(id, 1, 9.4);
  h.game.handle(id, 'experienceAction', { phase: 'begin', kind: 'repair-pressure', targetId: 'pressure' });
  h.step(1000, () => h.game.handle(id, 'experienceAction', { phase: 'maintain' }));
  assert.equal(h.state().incident, 'decompression');
  h.game.handle(id, 'experienceAction', { phase: 'cancel' }); assert.equal(h.state().actions.length, 0);
  h.hold(id, 'repair-pressure', 'pressure'); assert.equal(h.state().incident, 'none'); assert.equal(h.state().masksDeployed, false); assert.equal(h.state().players[id].oxygenMask, false);
});

test('smoke and medical drills recover through nearby held duties and reset cleanly', () => {
  const h = harness(), id = h.ids[0]; h.game.handle(id, 'incidentDrill', { kind: 'smoke' });
  h.reject(id, 'experienceAction', { phase: 'begin', kind: 'extinguish-smoke', targetId: 'electrical' });
  h.walk(id, 0, 12.3); h.walk(id, 1, 12.3); h.hold(id, 'extinguish-smoke', 'electrical');
  assert.equal(h.state().incident, 'none');
  h.game.handle(id, 'incidentDrill', { kind: 'medical' }); assert.equal(h.state().pilotCondition, 'poisoned');
  h.walk(id, 0, 12.3); h.walk(id, 0, -11.05); h.hold(id, 'aid-pilot', 'pilot');
  assert.equal(h.state().pilotCondition, 'recovering'); h.step(5100); assert.equal(h.state().pilotCondition, 'healthy');
  h.game.handle(id, 'incidentDrill', { kind: 'smoke' }); h.step(85100); assert.equal(h.game.currentPhase, 'ended');
  h.game.handle(id, 'restart', {}); assert.equal(h.state().incident, 'none'); assert.equal(h.state().pilotCondition, 'healthy'); assert.equal(h.state().actions.length, 0);
});

test('all four unique items can be requested and physically delivered by the attendant', () => {
  const h = harness(), id = h.ids[0]; h.walk(id, 0, -7.5);
  for (const item of ['water', 'coffee', 'meal', 'blanket'] as ServiceItem[]) {
    h.game.handle(id, 'requestService', { item }); const orderId = h.state().players[id].order!.id;
    h.reject(id, 'requestService', { item: 'water' }); assert.equal(h.state().players[id].order!.id, orderId);
    let carried = false, nearDelivery = false;
    for (let i = 0; i < 1700 && h.state().players[id].order; i++) {
      h.step(50); const attendant = h.game.snapshot().npcs.find(n => n.kind === 'attendant')!;
      assert.equal(canStand(attendant.x, attendant.z), true);
      carried ||= attendant.carriedItem === item;
      nearDelivery ||= attendant.carriedItem === item && Math.hypot(attendant.x - h.me().x, attendant.z - h.me().z) < 2.2;
    }
    assert.ok(carried && nearDelivery, `AI physically fetched and delivered ${item}`);
    assert.ok(h.state().players[id].received.includes(item), `${item} delivery completed before expiry`);
    h.reject(id, 'requestService', { item });
  }
  assert.deepEqual(h.state().players[id].received, ['water', 'coffee', 'meal', 'blanket']);
  assert.equal(h.game.currentPhase, 'playing');
});

test('human crew deliveries validate recipient, current request, matching item and proximity', () => {
  const h = harness(6), crew = h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id, passenger = h.game.snapshot().players.find(p => p.role === 'Passenger')!.id;
  h.walk(passenger, 0, -7.5);
  h.game.handle(passenger, 'requestService', { item: 'coffee' }); const order = h.state().players[passenger].order!;
  h.reject(crew, 'servePlayer', { playerId: passenger, requestId: order.id });
  h.walk(crew, 0, 9.4); h.walk(crew, -1.4, 9.4); h.game.handle(crew, 'pickUpService', { item: 'coffee' });
  h.reject(crew, 'servePlayer', { playerId: passenger, requestId: order.id });
  h.walk(crew, 0, 9.4); h.walk(crew, 0, h.me(passenger).z);
  h.reject(crew, 'servePlayer', { playerId: passenger, requestId: 'expired' });
  h.game.handle(crew, 'servePlayer', { playerId: passenger, requestId: order.id });
  assert.deepEqual(h.state().players[passenger].received, ['coffee']); assert.equal(h.me(crew).carriedItem, null);
  h.reject(crew, 'servePlayer', { playerId: passenger, requestId: order.id });
  const snapshot = h.game.snapshot(); snapshot.experience.players[passenger].received.push('blanket');
  assert.deepEqual(h.state().players[passenger].received, ['coffee'], 'snapshots cannot mutate delivery progress');
});

test('reading, resting and seatbelts require cabin time and release on movement', () => {
  const h = harness(), id = h.ids[0];
  h.game.handle(id, 'experienceAction', { phase: 'begin', kind: 'read', targetId: id });
  assert.equal(h.state().actions[0].kind, 'working'); assert.equal(h.state().actions[0].targetId, '', 'ordinary and covert holds use the same public shape');
  h.hold(id, 'read', id); assert.equal(h.state().players[id].activity, 'reading');
  h.hold(id, 'rest', id); assert.equal(h.state().players[id].activity, 'resting');
  h.hold(id, 'fasten-seatbelt', id); assert.equal(h.state().players[id].seatbelt, true);
  h.game.handle(id, 'move', { dx: 0, dz: -1, yaw: 0 }); h.step(50);
  assert.equal(h.state().players[id].activity, 'idle'); assert.equal(h.state().players[id].seatbelt, false);
  h.walk(id, 0, -11.05); h.reject(id, 'experienceAction', { phase: 'begin', kind: 'read', targetId: id });
});

test('covert damage is private, held, proximity gated and cooldown limited; meetings pause incidents', () => {
  const h = harness(6, 'Engineer'), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!, crew = h.game.snapshot().players.find(p => p.role === 'Engineer')!.id;
  h.step(15100); h.walk(sab, 0, 9.4); h.walk(sab, 1, 9.4); h.walk(crew, 0, 9.4); h.walk(crew, 1, 9.4);
  h.reject(crew, 'experienceAction', { phase: 'begin', kind: 'damage-pressure', targetId: 'pressure' });
  h.game.handle(sab, 'experienceAction', { phase: 'begin', kind: 'damage-pressure', targetId: 'pressure' }); h.step(300);
  assert.equal(h.state().actions[0].kind, 'working'); assert.equal(h.state().actions[0].targetId, '');
  assert.ok(!JSON.stringify(h.game.snapshot()).includes('damage-pressure'));
  h.step(3800, () => h.game.handle(sab, 'experienceAction', { phase: 'maintain' })); assert.equal(h.state().incident, 'decompression');
  h.reject(sab, 'experienceAction', { phase: 'begin', kind: 'damage-electrical', targetId: 'electrical' });
  h.game.handle(h.game.snapshot().players.find(p => p.role === 'Passenger')!.id, 'requestService', { item: 'meal' });
  h.game.handle(crew, 'report', {}); assert.equal(h.game.currentPhase, 'meeting');
  const before = h.state(); h.step(3000); assert.deepEqual(h.state(), before, 'incident, order countdown and mask state freeze in meetings');
  h.game.removePlayer(sab); assert.equal(h.game.currentPhase, 'meeting', 'disconnect cannot skip incident resolution');
  for (const id of h.ids.filter(id => id !== sab)) h.game.handle(id, 'vote', { targetId: 'skip' });
  assert.equal(h.game.currentPhase, 'playing');
  h.walk(crew, 0, 7.5); h.hold(crew, 'use-mask', crew); h.walk(crew, 0, 9.4); h.walk(crew, 1, 9.4); h.hold(crew, 'repair-pressure', 'pressure');
  assert.equal(h.state().incident, 'none');
  assert.equal(h.game.currentPhase, 'playing'); assert.equal(h.game.snapshot().winner, null, 'repairing the incident cannot skip the remaining flight and landing');
});

test('wrong deliveries agitate the exact passenger and nearby crew can calm them', () => {
  const h = harness(3, 'Cabin Crew'), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!, crew = h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id;
  h.step(15100); const npc = h.game.snapshot().npcs.find(n => n.request)!; assert.ok(npc.request);
  const seat = NPC_PASSENGER_SEATS.find(s => s.id === npc.id)!;
  const wrong = npc.request.item === 'water' ? 'coffee' : 'water';
  h.walk(sab, 0, 9.4); h.walk(sab, -1.4, 9.4); h.game.handle(sab, 'pickUpService', { item: wrong });
  h.walk(sab, 0, 9.4); h.walk(sab, 0, seat.serviceZ); h.walk(sab, seat.serviceX, seat.serviceZ);
  h.hold(sab, 'wrong-order', npc.id);
  assert.ok(h.state().agitated.includes(npc.id)); assert.equal(h.me(sab).carriedItem, null); assert.ok(h.game.snapshot().service.satisfaction < 100);
  h.walk(crew, 0, h.me(crew).z); h.walk(crew, 0, seat.serviceZ); h.walk(crew, seat.serviceX, seat.serviceZ); h.hold(crew, 'calm-passenger', npc.id);
  assert.ok(!h.state().agitated.includes(npc.id)); h.step(7000); assert.equal(h.game.snapshot().npcs.find(n => n.id === npc.id)!.pose, 'seated');
});

test('pilot tampering needs a carried drink and clear nearby access, then first aid restores the pilot', () => {
  const h = harness(3, 'Cabin Crew'), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!, crew = h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id;
  h.step(15100); h.reject(sab, 'experienceAction', { phase: 'begin', kind: 'poison-pilot', targetId: 'pilot' });
  h.walk(sab, 0, 9.4); h.walk(sab, -1.4, 9.4); h.game.handle(sab, 'pickUpService', { item: 'water' });
  h.walk(sab, 0, 9.4); h.walk(sab, 0, -9.6); h.walk(sab, -1.65, -9.6);
  h.reject(sab, 'experienceAction', { phase: 'begin', kind: 'poison-pilot', targetId: 'pilot' });
  h.walk(sab, 0, -9.6); h.walk(sab, 0, -11.05); h.hold(sab, 'poison-pilot', 'pilot');
  assert.equal(h.state().pilotCondition, 'poisoned'); assert.equal(h.me(sab).carriedItem, null); assert.equal(h.game.snapshot().flight.mode, 'autopilot');
  h.walk(crew, 0, -11.05); h.hold(crew, 'aid-pilot', 'pilot'); assert.equal(h.state().pilotCondition, 'recovering');
  h.step(5100); assert.equal(h.state().pilotCondition, 'healthy');
});

test('visible player attacks require draw time, range and cooldown; victims are immobile until held rescue', () => {
  const h = harness(6, 'Cabin Crew'), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!, rescuer = h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id, victim = h.ids.find(id => id !== sab && id !== rescuer && h.me(id).role !== 'Captain')!;
  h.step(10100); h.walk(sab, 0, 4); h.walk(victim, 0, 4.8);
  h.reject(victim, 'attackPlayer', { playerId: sab }); h.reject(sab, 'attackPlayer', { playerId: victim });
  h.game.handle(sab, 'drawWeapon', { drawn: true }); h.reject(sab, 'attackPlayer', { playerId: victim }); h.step(650);
  h.game.handle(sab, 'attackPlayer', { playerId: victim }); assert.equal(h.state().players[victim].incapacitated, true);
  const location = h.me(victim); h.game.handle(victim, 'move', { dx: 0, dz: 1, yaw: 2 }); h.step(500); assert.deepEqual(h.me(victim), location);
  h.game.handle(victim, 'requestService', { item: 'meal' }); assert.equal(h.state().players[victim].order, null);
  h.reject(victim, 'experienceAction', { phase: 'begin', kind: 'rest', targetId: victim });
  h.walk(rescuer, 0, 4.8); h.hold(rescuer, 'rescue-player', victim); assert.equal(h.state().players[victim].incapacitated, false);
  h.reject(sab, 'attackPlayer', { playerId: victim }); h.walk(victim, 0, 5.8);
});

test('only the marshal can detain an exposed attacker with a held nearby intervention', () => {
  const h = harness(6, 'Air Marshal'), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!;
  const defender = h.game.snapshot().players.find(p => p.role === 'Air Marshal')!.id;
  const civilian = h.game.snapshot().players.find(p => p.id !== sab && p.role !== 'Air Marshal')!.id;
  h.walk(sab, 0, 4); h.walk(defender, 0, 4.5); h.walk(civilian, 0, 4.5);
  h.reject(defender, 'experienceAction', { phase: 'begin', kind: 'disarm', targetId: sab });
  h.game.handle(sab, 'drawWeapon', { drawn: true }); h.step(650);
  h.reject(civilian, 'experienceAction', { phase: 'begin', kind: 'disarm', targetId: sab });
  h.hold(defender, 'disarm', sab); assert.equal(h.me(sab).detained, true); assert.equal(h.me(sab).weaponDrawn, false); assert.equal(h.me(sab).equippedTool, null);
  assert.equal(h.game.snapshot().winner, null); assert.equal(h.game.currentPhase, 'playing', 'the Marshal secures the threat; the crew must still land');
  assert.ok(!JSON.stringify(h.game.snapshot()).includes('"allegiance":'));
});

test('weather practice reuses authoritative controls without skipping the current story chapter', () => {
  const h = harness(), id = h.ids[0]; h.game.handle(id, 'incidentDrill', { kind: 'weather' });
  assert.equal(h.game.snapshot().story.stage, 'departure'); assert.equal(h.game.snapshot().story.turbulence.active, true);
  h.reject(id, 'incidentDrill', { kind: 'weather' }); h.game.handle(id, 'flightControl', { roll: 1, pitch: 1 }); h.step(300);
  assert.equal(h.game.snapshot().story.turbulence.operatorId, null);
  h.walk(id, 0, -11.6);
  h.step(22000, () => { const f = h.game.snapshot().story.turbulence; h.game.handle(id, 'flightControl', { roll: -f.roll * 3, pitch: -f.pitch * 3 }); });
  assert.equal(h.game.snapshot().story.turbulence.active, false); assert.equal(h.game.snapshot().story.stage, 'departure'); assert.equal(h.state().incident, 'none');
});


test('a held wrong order cannot apply old progress to a replacement passenger request', () => {
  let now = 0;
  const cabin = new CabinSimulation(), npc = cabin.get('passenger-01')!;
  const player: Player = { id: 'actor', name: 'Actor', color: '#ffffff', x: -1, z: -5.98, yaw: 0, role: 'Cabin Crew', ready: true, detained: false, model: 'attendant-player', weaponDrawn: false, equippedTool: null, carriedItem: 'coffee' };
  const experience = new ExperienceSimulation({ training: false, now: () => now, playing: () => true, players: () => [player], cabin, canAct: () => true, saboteur: () => true, covertReady: () => true, useCovert: () => {}, error: (_id, message) => assert.fail(message), announce: () => {}, creditService: () => {}, damage: () => {}, weather: () => false });
  experience.reset([player.id]);
  npc.request = { id: 'first-request', item: 'water', remaining: 1, claimedBy: null };
  experience.action(player.id, { phase: 'begin', kind: 'wrong-order', targetId: npc.id });
  for (let i = 0; i < 20; i++) { experience.action(player.id, { phase: 'maintain' }); now += 50; experience.step(.05, false, 0); }
  npc.request = { id: 'replacement-request', item: 'meal', remaining: 85, claimedBy: null };
  for (let i = 0; i < 30; i++) { experience.action(player.id, { phase: 'maintain' }); now += 50; experience.step(.05, false, 0); }
  assert.equal(experience.snapshot().actions.length, 0); assert.deepEqual(experience.snapshot().agitated, []);
  assert.equal(npc.request.id, 'replacement-request'); assert.equal(player.carriedItem, 'coffee');
});
