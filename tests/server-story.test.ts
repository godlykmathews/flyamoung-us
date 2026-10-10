import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { useCabinFixture } from './helpers/cabin-fixture.js';
import { JourneySimulation } from '../server/src/systems/story.js';
import { reserveRoomCode, releaseRoomCode } from '../server/src/systems/roomCodes.js';
import { INTERACTION_STATIONS, NPC_PASSENGER_SEATS, SERVICE_GALLEY } from '../shared/world.js';
import { SAFETY_INSTRUCTIONS, SAFETY_STEP_DURATIONS, type SafetyChallenge, type WorldActionKind } from '../shared/protocol.js';

function harness(count = 1) {
  let now = 0;
  const errors: string[] = [];
  let safetyChallenge: SafetyChallenge | null = null;
  const game = new FlightGame('1234', count === 1, (_id, type, data) => { if (type === 'error') errors.push((data as { message: string }).message); if (type === 'safetyChallenge') safetyChallenge = data as SafetyChallenge; }, () => now);
  useCabinFixture(game);
  const ids = Array.from({ length: count }, (_, i) => `p${i}`), id = ids[0];
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  game.handle(id, 'start', {});
  function step(ms: number, perFrame?: () => void) { for (let t = 0; t < ms; t += 50) { perFrame?.(); now += 50; game.step(.05); } }
  const me = () => game.snapshot().players.find(p => p.id === id)!;
  function walk(x: number, z: number) {
    let guard = 0;
    while (Math.hypot(me().x - x, me().z - z) > .06) {
      const dx = x - me().x, dz = z - me().z, length = Math.max(.3, Math.hypot(dx, dz));
      game.handle(id, 'move', { dx: dx / length, dz: dz / length, yaw: 0 }); step(50);
      assert.ok(++guard < 1000, `Path blocked at ${me().x},${me().z} toward ${x},${z}`);
    }
    game.handle(id, 'move', { dx: 0, dz: 0, yaw: 0 });
  }
  function hold(kind: WorldActionKind, targetId: string, ms = 4100) {
    game.handle(id, 'beginAction', { kind, targetId });
    step(ms, () => game.handle(id, 'maintainAction', {}));
  }
  function guideAll() {
    step(1200);
    for (let attempts = 0; attempts < 6; attempts++) {
      const npc = game.snapshot().npcs.find(n => n.needsSeat);
      if (!npc) break;
      walk(0, me().z); walk(0, npc.z); hold('guide-passenger', npc.id, 2700);
    }
    step(6000);
  }
  function secureCart() { walk(0, 15.5); walk(-1.25, 15.5); hold('secure-cart', 'service-cart', 3200); }
  function safetyDemo() {
    walk(0, me().z); walk(0, -8.6); game.handle(id, 'beginSafety', {});
    assert.ok(safetyChallenge);
    game.handle(id, 'submitSafety', { token: safetyChallenge.token, order: SAFETY_INSTRUCTIONS.map(card => card.id) }); step(SAFETY_STEP_DURATIONS.reduce((sum, duration) => sum + duration, 0) * 1000);
    assert.equal(game.snapshot().safety.status, 'complete');
  }
  return { game, id, ids, step, walk, me, hold, guideAll, secureCart, safetyDemo, errors };
}

test('four-digit room codes reserve all 9000 values without collisions and release for reuse', () => {
  const codes = Array.from({ length: 9000 }, reserveRoomCode);
  assert.equal(new Set(codes).size, 9000); assert.ok(codes.every(c => /^[1-9][0-9]{3}$/.test(c)));
  assert.throws(reserveRoomCode, /in use/);
  releaseRoomCode(codes[421]); assert.equal(reserveRoomCode(), codes[421]);
  codes.forEach(releaseRoomCode);
});

test('held actions require proximity, fresh keepalives and sustained server time', () => {
  const h = harness();
  h.game.handle(h.id, 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' });
  assert.equal(h.game.snapshot().interactions.length, 0);
  h.walk(0, 15.5); h.walk(-1.25, 15.5);
  h.game.handle(h.id, 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' });
  h.step(300); assert.ok(h.game.snapshot().interactions[0].progress < 1);
  h.game.handle(h.id, 'completeAction', {}); h.step(400);
  assert.equal(h.game.snapshot().interactions.length, 0); assert.equal(h.game.snapshot().story.objectives[0].current, 0);
  h.game.handle(h.id, 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' });
  h.step(1000, () => { h.game.handle(h.id, 'move', { dx: 1, dz: 0, yaw: 0 }); h.game.handle(h.id, 'maintainAction', {}); });
  h.game.handle(h.id, 'move', { dx: 0, dz: 0, yaw: 0 });
  assert.equal(h.game.snapshot().interactions.length, 0, 'walking away cancels even with keepalives');
  h.walk(-1.25, 15.5);
  h.hold('secure-cart', 'service-cart', 3200);
  assert.equal(h.game.snapshot().story.objectives[0].current, 1);
  h.hold('secure-cart', 'service-cart', 3200); assert.equal(h.game.snapshot().story.objectives[0].current, 1);
});

test('standing passengers return to their exact seat only after held nearby guidance', () => {
  const h = harness(); h.step(7000);
  const npc = h.game.snapshot().npcs.find(n => n.needsSeat)!; assert.ok(npc);
  h.game.handle(h.id, 'beginAction', { kind: 'guide-passenger', targetId: npc.id });
  h.game.handle(h.id, 'cancelAction', {}); h.step(1000);
  assert.equal(h.game.snapshot().npcs.find(n => n.id === npc.id)!.needsSeat, true);
  h.walk(0, npc.z); h.hold('guide-passenger', npc.id, 2700);
  assert.equal(h.game.snapshot().npcs.find(n => n.id === npc.id)!.needsSeat, false);
  h.step(6000);
  const seated = h.game.snapshot().npcs.find(n => n.id === npc.id)!;
  assert.equal(seated.pose, 'seated'); assert.equal(seated.x, seated.homeX); assert.equal(seated.z, seated.homeZ);
  assert.equal(h.game.snapshot().story.objectives.find(o => o.id === 'guide-passenger')!.current, 1);
});

test('flight control rejects stale, remote and non-finite input; sustained correction stabilizes both axes', () => {
  const story = new JourneySimulation(true);
  story.credit('secure-cart'); story.credit('guide-passenger'); story.credit('safety-demo'); story.advance(); story.credit('serve-passenger'); story.advance();
  let now = 0;
  for (let i = 0; i < 400; i++) { now += 50; story.step(.05, now, () => false); }
  assert.equal(story.snapshot().turbulence.stability, 0);
  story.setControl('pilot', -1, 1, now); now += 400; story.step(.05, now, () => true);
  assert.equal(story.snapshot().turbulence.operatorId, null);
  for (let i = 0; i < 600 && story.needed('stabilize-flight'); i++) {
    const state = story.snapshot().turbulence;
    story.setControl('pilot', -state.roll * 3, -state.pitch * 3, now); now += 50; story.step(.05, now, () => true);
  }
  assert.equal(story.snapshot().turbulence.stability, 10);
  const h = harness(); h.game.handle(h.id, 'flightControl', { roll: Infinity, pitch: NaN }); h.step(1000);
  assert.equal(h.game.snapshot().story.turbulence.operatorId, null);
});

test('solo crew completes cabin duties and then lands through authoritative pilot controls', () => {
  const h = harness(); h.secureCart(); h.walk(0, h.me().z); h.guideAll(); h.safetyDemo();
  assert.equal(h.game.snapshot().story.stage, 'service');
  // Wait for a fresh request, then physically fetch and deliver it before AI priority expires.
  let passenger = h.game.snapshot().npcs.find(n => n.request && n.request.remaining > 76);
  for (let i = 0; !passenger && i < 400; i++) { h.step(50); passenger = h.game.snapshot().npcs.find(n => n.request && n.request.remaining > 76); }
  assert.ok(passenger?.request);
  const request = { ...passenger.request }, seat = NPC_PASSENGER_SEATS.find(s => s.id === passenger.id)!;
  h.walk(0, h.me().z); h.walk(0, SERVICE_GALLEY.z); h.walk(-1.4, SERVICE_GALLEY.z);
  h.game.handle(h.id, 'pickUpService', { item: request.item }); h.walk(0, h.me().z); h.walk(0, seat.serviceZ); h.walk(seat.serviceX, seat.serviceZ);
  h.game.handle(h.id, 'servePassenger', { npcId: passenger.id, requestId: request.id }); h.step(200);
  assert.equal(h.game.snapshot().story.stage, 'turbulence');
  h.walk(0, h.me().z); h.guideAll();
  h.walk(0, h.me().z); h.walk(0, 12.3); h.walk(1, 12.3); h.hold('secure-equipment', 'equipment-locker');
  h.game.handle(h.id, 'flightControl', { roll: -1, pitch: 1 }); h.step(500);
  assert.equal(h.game.snapshot().story.turbulence.operatorId, null, 'remote input cannot claim controls');
  h.walk(0, h.me().z); h.walk(0, -11.6);
  h.game.handle(h.id, 'flightControl', { roll: Infinity, pitch: NaN }); h.step(500);
  assert.equal(h.game.snapshot().story.turbulence.operatorId, null, 'non-finite cockpit input rejected');
  h.step(22000, () => { const f = h.game.snapshot().story.turbulence; h.game.handle(h.id, 'flightControl', { roll: -f.roll * 3, pitch: -f.pitch * 3 }); });
  assert.equal(h.game.snapshot().experience.incident, 'decompression');
  assert.equal(h.game.snapshot().story.stage, 'turbulence', 'unresolved cabin pressure blocks approach');
  h.walk(0, -8);
  h.game.handle(h.id, 'experienceAction', { phase: 'begin', kind: 'use-mask', targetId: h.id });
  h.step(2100, () => h.game.handle(h.id, 'experienceAction', { phase: 'maintain' }));
  h.walk(0, 9.4); h.walk(1, 9.4);
  h.game.handle(h.id, 'experienceAction', { phase: 'begin', kind: 'repair-pressure', targetId: 'pressure' });
  h.step(6100, () => h.game.handle(h.id, 'experienceAction', { phase: 'maintain' }));
  assert.equal(h.game.snapshot().story.stage, 'approach');
  h.walk(0, 9.4); h.walk(0, -8.5); h.hold('cabin-check', 'cabin-check');
  assert.equal(h.game.snapshot().operations.landingReady, true);
  assert.equal(h.game.snapshot().winner, null, 'finishing cabin tasks cannot replace the manual landing');
  h.walk(0, -11.6);
  h.game.handle(h.id, 'startLanding', {});
  assert.equal(h.game.snapshot().operations.stage, 'landing');
  for (let frame = 0; frame < 2000 && h.game.currentPhase === 'playing'; frame++) {
    const touchdown = h.game.snapshot().operations.altitude === 0;
    h.game.handle(h.id, 'aircraftControl', { throttle: touchdown ? 0 : .32, pitch: touchdown ? 0 : -.12, roll: 0, gearDown: true, brakes: touchdown });
    h.step(50);
  }
  assert.equal(h.game.snapshot().operations.stage, 'arrived');
  assert.equal(h.game.snapshot().operations.gearDown, true);
  assert.equal(h.game.snapshot().operations.airspeed, 0);
  assert.equal(h.game.snapshot().winner, 'crew'); assert.equal(h.game.snapshot().phase, 'ended');
  assert.ok(h.game.snapshot().remaining > 0); assert.ok(INTERACTION_STATIONS.length === 3);
});

test('weapon is concealed by default, visible only after authorized draw and hidden at meetings', () => {
  const h = harness(3), sab = h.ids.find(id => h.game.getSecret(id).allegiance === 'saboteur')!, crew = h.ids.find(id => id !== sab)!;
  assert.ok(h.game.snapshot().players.every(p => !p.weaponDrawn));
  h.game.handle(crew, 'drawWeapon', { drawn: true }); assert.equal(h.game.snapshot().players.find(p => p.id === crew)!.weaponDrawn, false);
  const model = h.game.snapshot().players.find(p => p.id === sab)!.model;
  h.game.handle(sab, 'drawWeapon', { drawn: true }); assert.equal(h.game.snapshot().players.find(p => p.id === sab)!.weaponDrawn, true);
  assert.equal(h.game.snapshot().players.find(p => p.id === sab)!.model, model);
  h.game.handle(sab, 'drawWeapon', { drawn: false });
  assert.equal(h.game.snapshot().players.find(p => p.id === sab)!.weaponDrawn, true, 'cannot conceal between public snapshots');
  const errors = h.errors.length; h.game.handle(sab, 'killNpc', { npcId: 'attendant-1' });
  assert.equal(h.errors.length, errors + 1); assert.match(h.errors.at(-1)!, /Raise the weapon/);
  h.step(650); h.game.handle(sab, 'drawWeapon', { drawn: false });
  assert.equal(h.game.snapshot().players.find(p => p.id === sab)!.weaponDrawn, false);
  h.game.handle(sab, 'drawWeapon', { drawn: true });
  h.step(20100); h.game.handle(crew, 'report', {});
  assert.equal(h.game.snapshot().phase, 'meeting'); assert.ok(h.game.snapshot().players.every(p => !p.weaponDrawn));
});
