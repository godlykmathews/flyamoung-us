import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { SAFETY_INSTRUCTIONS, SAFETY_STEP_DURATION, SAFETY_STEP_DURATIONS, type SafetyChallenge } from '../shared/protocol.js';
import { SAFETY_DEMO_STATION } from '../shared/world.js';

const order = SAFETY_INSTRUCTIONS.map(card => card.id);
const demoDurationMs = SAFETY_STEP_DURATIONS.reduce((sum, duration) => sum + duration, 0) * 1000;
function createSetup(count = 1) {
  let now = 0;
  const messages: Array<{ id: string; type: string; data: unknown }> = [];
  const game = new FlightGame('1234', count === 1, (id, type, data) => messages.push({ id, type, data }), () => now);
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  game.handle(ids[0], 'start', {});
  function step(ms: number) { for (let t = 0; t < ms; t += 50) { now += 50; game.step(.05); } }
  const player = (id: string) => game.snapshot().players.find(p => p.id === id)!;
  function walk(id: string, x: number, z: number) {
    for (let i = 0; Math.hypot(player(id).x - x, player(id).z - z) > .05; i++) {
      assert.ok(i < 1000, 'clear-aisle route must remain walkable');
      const dx = x - player(id).x, dz = z - player(id).z, distance = Math.max(.3, Math.hypot(dx, dz));
      game.handle(id, 'move', { dx: dx / distance, dz: dz / distance, yaw: 0 }); step(50);
    }
    game.handle(id, 'move', { dx: 0, dz: 0, yaw: 0 });
  }
  function open(id = ids[0]) {
    walk(id, 0, player(id).z); walk(id, SAFETY_DEMO_STATION.x, SAFETY_DEMO_STATION.z);
    game.handle(id, 'beginSafety', {});
    const message = [...messages].reverse().find(message => message.id === id && message.type === 'safetyChallenge');
    assert.ok(message); return message.data as SafetyChallenge;
  }
  const errors = () => messages.filter(message => message.type === 'error').map(message => (message.data as { message: string }).message);
  return { game, ids, step, walk, player, open, messages, errors };
}

function setup(count = 1, crewAllegiance?: 'crew' | 'saboteur') {
  for (let i = 0; i < 100; i++) {
    const h = createSetup(count);
    if (!crewAllegiance || h.game.getSecret(h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id).allegiance === crewAllegiance) return h;
  }
  throw new Error('Could not assign the required Cabin Crew fixture');
}

test('safety briefing requires proximity, a private challenge and the exact card order', () => {
  const h = setup(), id = h.ids[0];
  h.game.handle(id, 'beginSafety', {}); assert.equal(h.game.snapshot().safety.status, 'idle');
  const challenge = h.open();
  assert.deepEqual(new Set(challenge.cards), new Set(order)); assert.notDeepEqual(challenge.cards, order);
  assert.equal(JSON.stringify(h.game.snapshot()).includes(challenge.token), false);
  h.game.handle(id, 'submitSafety', { token: 'forged', order }); assert.equal(h.game.snapshot().safety.status, 'arranging');
  h.game.handle(id, 'submitSafety', { token: challenge.token, order: ['seatbelt', 'seatbelt', 'oxygen', 'lifevest'] });
  assert.match(h.errors().at(-1)!, /different box/);
  h.game.handle(id, 'submitSafety', { token: challenge.token, order: challenge.cards });
  assert.match(h.errors().at(-1)!, /seatbelt, oxygen mask, life vest, then exits/);
  assert.equal(h.game.snapshot().safety.status, 'arranging');
  h.game.handle(id, 'submitSafety', { token: challenge.token, order });
  assert.equal(h.game.snapshot().safety.status, 'demonstrating');
  assert.equal(h.player(id).yaw, Math.PI);
  assert.equal(h.game.snapshot().story.objectives.find(goal => goal.id === 'safety-demo')!.current, 0);
  h.game.handle(id, 'move', { dx: 0, dz: 1, yaw: 0 }); h.step(1000);
  assert.equal(h.player(id).x, SAFETY_DEMO_STATION.x); assert.equal(h.player(id).z, SAFETY_DEMO_STATION.z); assert.equal(h.player(id).yaw, Math.PI);
  h.step(SAFETY_STEP_DURATIONS[0] * 1000 - 1000);
  assert.equal(h.game.snapshot().safety.step, 1); assert.equal(h.game.snapshot().safety.elapsed, 0);
  h.step(SAFETY_STEP_DURATION * 2000); assert.equal(h.game.snapshot().safety.step, 3);
  h.step(SAFETY_STEP_DURATION * 1000 - 50); assert.equal(h.game.snapshot().safety.status, 'demonstrating');
  h.step(50); assert.equal(h.game.snapshot().safety.status, 'complete');
  assert.equal(h.game.snapshot().story.objectives.find(goal => goal.id === 'safety-demo')!.current, 1);
  h.game.handle(id, 'submitSafety', { token: challenge.token, order });
  assert.equal(h.game.snapshot().story.objectives.find(goal => goal.id === 'safety-demo')!.current, 1, 'replaying a token cannot add credit');
});

test('safety arrangement cancels on request, walking away or timeout without credit', () => {
  const h = setup(), id = h.ids[0];
  const canceled = h.open(); h.game.handle(id, 'cancelSafety', {});
  assert.equal(h.game.snapshot().safety.status, 'idle');
  h.game.handle(id, 'submitSafety', { token: canceled.token, order }); assert.equal(h.game.snapshot().safety.status, 'idle');
  h.open(); h.walk(id, 0, -5.8); assert.equal(h.game.snapshot().safety.status, 'idle');
  const stale = h.open(); h.step(60000); assert.equal(h.game.snapshot().safety.status, 'idle');
  h.game.handle(id, 'submitSafety', { token: stale.token, order }); assert.equal(h.game.snapshot().safety.status, 'idle');
  assert.equal(h.game.snapshot().story.objectives.find(goal => goal.id === 'safety-demo')!.current, 0);
});

test('one presenter owns the private puzzle, and disconnect frees the station', () => {
  const h = setup(8, 'crew'), [first, second] = h.game.snapshot().players.filter(p => p.role === 'Cabin Crew').map(p => p.id);
  const challenge = h.open(first); h.walk(second, 0, -8.6);
  h.game.handle(second, 'beginSafety', {}); assert.match(h.errors().at(-1)!, /Another crew/);
  h.game.handle(second, 'submitSafety', { token: challenge.token, order });
  assert.equal(h.game.snapshot().safety.operatorId, first);
  assert.ok(h.messages.filter(message => message.type === 'safetyChallenge').every(message => message.id === first));
  h.game.handle(second, 'cancelSafety', {}); assert.equal(h.game.snapshot().safety.status, 'arranging');
  h.game.handle(first, 'submitSafety', { token: challenge.token, order });
  h.game.removePlayer(first); assert.equal(h.game.snapshot().safety.status, 'idle');
  if (h.game.currentPhase === 'playing') { h.game.handle(second, 'beginSafety', {}); assert.equal(h.game.snapshot().safety.operatorId, second); }
});

test('meetings pause the demonstration, detention resets it, and a new flight resets completed safety', () => {
  const h = setup(8, 'crew'), [operator, reporter] = h.game.snapshot().players.filter(p => p.role === 'Cabin Crew').map(p => p.id);
  const challenge = h.open(operator); h.step(21000);
  h.game.handle(operator, 'submitSafety', { token: challenge.token, order }); h.step(1000);
  h.game.handle(reporter, 'report', {}); assert.equal(h.game.currentPhase, 'meeting');
  const before = h.game.snapshot().safety; h.step(3000); assert.deepEqual(h.game.snapshot().safety, before);
  for (const id of h.ids) h.game.handle(id, 'vote', { targetId: operator });
  assert.equal(h.game.currentPhase, 'playing'); assert.equal(h.game.snapshot().safety.status, 'idle');
  h.game.handle(operator, 'beginSafety', {}); assert.equal(h.game.snapshot().safety.status, 'idle');

  const next = h.open(reporter); h.game.handle(reporter, 'submitSafety', { token: next.token, order }); h.step(demoDurationMs);
  assert.equal(h.game.snapshot().safety.status, 'complete'); h.step(360000);
  assert.equal(h.game.currentPhase, 'ended'); h.game.handle(h.ids[0], 'restart', {});
  assert.equal(h.game.currentPhase, 'lobby'); assert.deepEqual(h.game.snapshot().safety, { status: 'idle', operatorId: null, step: 0, elapsed: 0 });
  assert.equal(h.game.snapshot().story.objectives.find(goal => goal.id === 'safety-demo')!.current, 0);
});

test('a concealed Cabin Crew saboteur can perform their public safety duty, but a drawn weapon cancels preparation', () => {
  const h = setup(3, 'saboteur'), id = h.game.snapshot().players.find(p => p.role === 'Cabin Crew')!.id;
  h.open(id); h.game.handle(id, 'drawWeapon', { drawn: true }); assert.equal(h.game.snapshot().safety.status, 'idle');
  h.game.handle(id, 'beginSafety', {}); assert.equal(h.game.snapshot().safety.status, 'idle');
  h.step(650); h.game.handle(id, 'drawWeapon', { drawn: false });
  const challenge = h.open(id); h.game.handle(id, 'submitSafety', { token: challenge.token, order });
  h.game.handle(id, 'drawWeapon', { drawn: true }); assert.equal(h.player(id).weaponDrawn, false);
  h.step(demoDurationMs); assert.equal(h.game.snapshot().safety.status, 'complete');
});
