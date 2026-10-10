import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { useCabinFixture } from './helpers/cabin-fixture.js';
import { CabinSimulation } from '../server/src/systems/cabin.js';
import type { Role } from '../shared/protocol.js';
import { assignRoles } from '../server/src/systems/roles.js';
import { NPC_PASSENGER_SEATS, SERVICE_GALLEY, canStand, hasCabinSight } from '../shared/world.js';

function harness(count = 3, training = false, loyalRole?: Role, attempts = 0) {
  let now = 0;
  const errors: string[] = [];
  const game = new FlightGame('NPC_TEST', training, (_id, type, value) => { if (type === 'error') errors.push((value as { message: string }).message); }, () => now);
  useCabinFixture(game);
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  const advance = (ms: number) => { for (let n = 0; n < ms; n += 50) { now += 50; game.step(.05); } };
  const me = (id: string) => game.snapshot().players.find(p => p.id === id)!;
  function moveTo(id: string, x: number, z: number) {
    let steps = 0;
    while (Math.hypot(me(id).x - x, me(id).z - z) > .07) {
      const dx = x - me(id).x, dz = z - me(id).z, length = Math.max(.3, Math.hypot(dx, dz));
      game.handle(id, 'move', { dx: dx / length, dz: dz / length, yaw: 0 }); advance(50);
      assert.ok(++steps < 800, `Could not walk to ${x},${z}: ${JSON.stringify(me(id))}`);
    }
    game.handle(id, 'move', { dx: 0, dz: 0, yaw: 0 });
  }
  const reject = (id: string, type: string, data: unknown) => { const before = errors.length; game.handle(id, type, data); assert.equal(errors.length, before + 1, `${type} should reject`); };
  const result = { game, ids, advance, moveTo, me, reject, errors };
  const start = (): typeof result => {
    game.handle(ids[0], 'start', {});
    if (loyalRole && game.getSecret(game.snapshot().players.find(p => p.role === loyalRole)!.id).allegiance !== 'crew') {
      assert.ok(attempts < 100);
      return harness(count, training, loyalRole, attempts + 1).start();
    }
    return result;
  };
  return { game, ids, advance, moveTo, me, reject, errors, start };
}

test('cabin has 12 seated passengers and a pilot; AI walks valid aisle routes and serves requests', () => {
  const cabin = new CabinSimulation(), start = cabin.snapshot();
  assert.equal(start.filter(n => n.kind === 'passenger').length, 12);
  assert.equal(start.filter(n => n.kind === 'pilot').length, 1);
  assert.equal(start.filter(n => n.kind === 'attendant').length, 1);
  let seenClaim = false, seenHeld = false;
  for (let i = 0; i < 2400; i++) {
    cabin.step(.05);
    const current = cabin.snapshot(), ai = current.find(n => n.kind === 'attendant')!;
    assert.equal(canStand(ai.x, ai.z), true);
    if (ai.carriedItem) seenHeld = true;
    for (const npc of current.filter(n => n.kind !== 'attendant')) {
      const original = start.find(n => n.id === npc.id)!;
      assert.deepEqual([npc.x, npc.z, npc.pose], [original.x, original.z, 'seated']);
      if (npc.request?.claimedBy) { seenClaim = true; assert.ok(npc.request.remaining <= 70.001, 'AI respects human priority'); }
    }
  }
  assert.ok(cabin.serviceSnapshot().served > 0); assert.ok(seenClaim); assert.ok(seenHeld);
  const snapshot = cabin.snapshot(); snapshot[0].alive = false;
  assert.equal(cabin.snapshot()[0].alive, true, 'public snapshots cannot mutate authority');
});

test('killing attendant releases its request and freezes movement; missed requests incur small penalties', () => {
  const cabin = new CabinSimulation();
  for (let i = 0; i < 450; i++) cabin.step(.05);
  assert.ok(cabin.snapshot().some(n => n.request?.claimedBy === 'attendant-1'));
  assert.equal(cabin.kill('attendant-1'), true); assert.equal(cabin.kill('attendant-1'), false);
  assert.ok(cabin.snapshot().every(n => !n.request?.claimedBy));
  const dead = { ...cabin.get('attendant-1')! };
  let penalty = 0; for (let i = 0; i < 1600; i++) penalty += cabin.step(.05);
  assert.deepEqual(cabin.get('attendant-1'), dead); assert.equal(dead.pose, 'dead');
  assert.ok(penalty > 0 && penalty <= 4); assert.ok(cabin.serviceSnapshot().satisfaction < 100);
  cabin.reset(); assert.ok(cabin.snapshot().every(n => n.alive && !n.request));
  assert.deepEqual(cabin.serviceSnapshot(), { served: 0, missed: 0, satisfaction: 100 });
});

test('service requests reject mismatched items without consuming or changing the request', () => {
  const cabin = new CabinSimulation(); for (let i = 0; i < 125; i++) cabin.step(.05);
  const passenger = cabin.snapshot().find(n => n.request)!, request = passenger.request!;
  assert.equal(cabin.serve(passenger.id, request.id, request.item === 'water' ? 'coffee' : 'water'), false);
  assert.deepEqual(cabin.get(passenger.id)!.request, request); assert.equal(cabin.serviceSnapshot().served, 0);
  assert.equal(cabin.serve(passenger.id, request.id, request.item), true);
  assert.equal(cabin.serve(passenger.id, request.id, request.item), false);
});

test('passenger service validates galley proximity, item, current request, distance and single delivery', () => {
  const { game, ids, reject, advance, moveTo, me } = harness(1, true), id = ids[0];
  reject(id, 'pickUpService', { item: 'water' }); game.handle(id, 'start', {});
  reject(id, 'pickUpService', { item: 'water' }); reject(id, 'pickUpService', { item: 'forged' });
  advance(6100);
  const passenger = game.snapshot().npcs.find(n => n.request)!;
  const request = { ...passenger.request! };
  reject(id, 'servePassenger', { npcId: passenger.id, requestId: request.id });
  moveTo(id, 0, SERVICE_GALLEY.z); moveTo(id, -1.4, SERVICE_GALLEY.z);
  game.handle(id, 'pickUpService', { item: request.item }); assert.equal(me(id).carriedItem, request.item);
  reject(id, 'servePassenger', { npcId: passenger.id, requestId: 'stale' });
  const seat = NPC_PASSENGER_SEATS.find(s => s.id === passenger.id)!;
  moveTo(id, 0, SERVICE_GALLEY.z); moveTo(id, 0, seat.serviceZ); moveTo(id, seat.serviceX, seat.serviceZ);
  reject(id, 'servePassenger', { npcId: passenger.id, requestId: 'stale' });
  game.handle(id, 'servePassenger', { npcId: passenger.id, requestId: request.id });
  assert.equal(game.snapshot().service.served, 1); assert.equal(me(id).carriedItem, null);
  assert.equal(game.snapshot().npcs.find(n => n.id === passenger.id)!.request, null);
  reject(id, 'servePassenger', { npcId: passenger.id, requestId: request.id });
});

test('kill and covert objectives remain private, proximity gated, single-use and cooldown limited', () => {
  const { game, ids, advance, moveTo, reject } = harness().start();
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!, crew = ids.find(id => id !== sab)!;
  reject(crew, 'killNpc', { npcId: 'passenger-01' }); reject(crew, 'impostorTask', { taskId: 'tamper-galley' });
  reject(sab, 'killNpc', { npcId: 'passenger-01' });
  reject(sab, 'impostorTask', { taskId: 'tamper-galley' }); reject(sab, 'impostorTask', { taskId: 'fake' });
  advance(10100); reject(sab, 'killNpc', { npcId: 'pilot' }); reject(sab, 'killNpc', { npcId: '__proto__' });
  moveTo(sab, 0, -5.98); moveTo(sab, -1, -5.98);
  reject(sab, 'killNpc', { npcId: 'passenger-01' });
  game.handle(sab, 'drawWeapon', { drawn: true }); advance(650);
  game.handle(sab, 'killNpc', { npcId: 'passenger-01' });
  assert.equal(game.snapshot().npcs.find(n => n.id === 'passenger-01')!.alive, false);
  assert.equal(game.snapshot().integrity, 90); assert.equal(game.getSecret(sab).killCooldown, 25);
  reject(sab, 'killNpc', { npcId: 'passenger-01' }); reject(sab, 'killNpc', { npcId: 'passenger-02' });
  assert.equal(game.snapshot().integrity, 90);
  moveTo(sab, 0, -5.98); moveTo(sab, 0, 9.4); moveTo(sab, -1.4, 9.4);
  game.handle(sab, 'impostorTask', { taskId: 'tamper-galley' });
  assert.equal(game.snapshot().integrity, 82); reject(sab, 'impostorTask', { taskId: 'tamper-galley' });
  game.handle(sab, 'sabotage', { kind: 'blackout' });
  assert.ok(game.getSecret(sab).objectives.every(o => o.completed));
  assert.deepEqual(game.getSecret(crew).objectives, []);
  const publicJson = JSON.stringify(game.snapshot());
  for (const key of ['allegiance', 'teammates', 'killCooldown', 'killReadyAt']) assert.equal(publicJson.includes(`"${key}":`), false);
  const before = game.snapshot().npcs.find(n => n.id === 'attendant-1')!;
  let moved = false;
  for (let i = 0; i < 65; i++) { advance(50); const after = game.snapshot().npcs.find(n => n.id === 'attendant-1')!; moved ||= Math.hypot(before.x - after.x, before.z - after.z) > .1; }
  assert.ok(moved, 'AI continues movement during blackout');
});

test('pilot attacks require cockpit access and trigger a persistent ocean crash instead of rescue', () => {
  const { game, ids, advance, moveTo, reject } = harness(3, false, 'Cabin Crew').start();
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  advance(10100); moveTo(sab, 0, -9.6); moveTo(sab, -1.65, -9.6);
  assert.equal(hasCabinSight({ x: -1.65, z: -9.6 }, { x: -1.65, z: -11.05 }), false);
  game.handle(sab, 'drawWeapon', { drawn: true }); advance(650);
  reject(sab, 'killNpc', { npcId: 'pilot' }); assert.equal(game.snapshot().npcs.find(n => n.id === 'pilot')!.alive, true);
  moveTo(sab, 0, -9.6); moveTo(sab, 0, -11.05); moveTo(sab, -.6, -11.05);
  game.handle(sab, 'killNpc', { npcId: 'pilot' });
  assert.equal(game.snapshot().npcs.find(n => n.id === 'pilot')!.alive, false);
  assert.equal(game.currentPhase, 'ended'); assert.equal(game.snapshot().winner, 'saboteur');
  assert.equal(game.snapshot().operations.stage, 'crashed'); assert.equal(game.snapshot().operations.crashProgress, 0);
  const rescuer = game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id;
  game.handle(rescuer, 'experienceAction', { phase: 'begin', kind: 'aid-pilot', targetId: 'pilot' });
  advance(10000);
  assert.equal(game.snapshot().operations.crashProgress, 1, 'crash animation keeps advancing after the result is decided');
  assert.equal(game.snapshot().npcs.find(n => n.id === 'pilot')!.alive, false, 'reserve assistance cannot reverse a fatal crash');
  game.handle(ids[0], 'report', {}); assert.equal(game.currentPhase, 'ended');
  reject(sab, 'killNpc', { npcId: 'attendant-1' });
  game.handle(ids[0], 'restart', {});
  assert.ok(game.snapshot().npcs.every(n => n.alive && !n.request));
  assert.ok(game.snapshot().players.every(p => p.carriedItem === null && p.equippedTool === null)); assert.ok(game.getSecret(sab).objectives.length === 0);
  assert.equal(game.snapshot().operations.stage, 'boarding'); assert.equal(game.snapshot().operations.crashProgress, 0);
});

test('meetings pause NPC service and reject physical actions without skipping the flight after detention', () => {
  const { game, ids, advance, reject } = harness(3, false, 'Cabin Crew').start();
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  advance(20100); game.handle(ids[0], 'report', {}); assert.equal(game.currentPhase, 'meeting');
  const before = game.snapshot().npcs; advance(3000); assert.deepEqual(game.snapshot().npcs, before);
  reject(sab, 'killNpc', { npcId: 'attendant-1' }); reject(sab, 'pickUpService', { item: 'water' });
  reject(sab, 'servePassenger', { npcId: 'passenger-01', requestId: 'stale' }); reject(sab, 'impostorTask', { taskId: 'tamper-galley' });
  for (const id of ids) game.handle(id, 'vote', { targetId: sab });
  assert.equal(game.currentPhase, 'playing', 'detention cannot skip the remaining journey');
  assert.equal(game.snapshot().players.find(player => player.id === sab)!.detained, true);
  assert.equal(game.snapshot().winner, null); assert.ok(game.snapshot().npcs.every(n => n.alive));
});

test('three-player public duties remain distinct while all players share ordinary passenger appearance', () => {
  for (let i = 0; i < 30; i++) {
    const { game, ids } = harness(); game.handle(ids[0], 'start', {});
    const cabinCrew = game.snapshot().players.filter(p => p.role === 'Cabin Crew');
    assert.equal(cabinCrew.length, 1);
    assert.equal(game.snapshot().players.filter(p => p.role === 'Captain').length, 1);
    assert.equal(game.snapshot().players.filter(p => p.role === 'Engineer').length, 1);
    assert.ok(game.snapshot().players.every(p => p.model === 'passenger-a' && !p.weaponDrawn && p.equippedTool === null));
  }
  assert.equal([...assignRoles(['a', 'b', 'c'], false).values()].filter(a => a.allegiance === 'saboteur').length, 1);
});

test('detaining the only saboteur blocks their physical actions while the crew finishes its flight', () => {
  const { game, ids, advance, reject } = harness(8); game.handle(ids[0], 'start', {});
  const sab = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  advance(20100); game.handle(ids[0], 'report', {});
  for (const id of ids) game.handle(id, 'vote', { targetId: sab });
  assert.equal(game.currentPhase, 'playing'); assert.equal(game.snapshot().winner, null); assert.equal(game.snapshot().players.find(p => p.id === sab)!.detained, true);
  reject(sab, 'killNpc', { npcId: 'attendant-1' }); reject(sab, 'pickUpService', { item: 'water' });
  reject(sab, 'servePassenger', { npcId: 'passenger-01', requestId: 'stale' }); reject(sab, 'impostorTask', { taskId: 'tamper-galley' });
  assert.ok(game.snapshot().npcs.every(n => n.alive)); assert.ok(game.getSecret(sab).objectives.every(o => !o.completed));
});
