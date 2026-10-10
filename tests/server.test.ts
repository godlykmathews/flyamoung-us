import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { assignRoles } from '../server/src/systems/roles.js';
import type { TaskChallenge } from '../shared/protocol.js';

function setup(count = 3, training = false) {
  let now = 0;
  const events: { id: string; type: string; payload: any }[] = [];
  const game = new FlightGame('TEST', training, (id, type, payload) => events.push({ id, type, payload }), () => now);
  const ids = Array.from({ length: count }, (_, i) => `player-${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  const advance = (milliseconds: number) => { for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) { now += 50; game.step(0.05); } };
  const move = (id: string, dx: number, dz: number, duration: number) => {
    for (let elapsed = 0; elapsed < duration; elapsed += 50) { game.handle(id, 'move', { dx, dz, yaw: 0 }); advance(50); }
    game.handle(id, 'move', { dx: 0, dz: 0, yaw: 0 });
  };
  return { game, ids, events, advance, move };
}

test('roles have independent private assignments and expected saboteur counts', () => {
  for (const count of [3, 7, 8, 10]) {
    const assignments = assignRoles(Array.from({ length: count }, (_, i) => String(i)), false);
    assert.equal([...assignments.values()].filter(p => p.allegiance === 'saboteur').length, count >= 8 ? 2 : 1);
    assert.equal([...assignments.values()].filter(p => p.role === 'Captain').length, 1);
  }
  assert.equal(assignRoles(['solo'], true).get('solo')?.allegiance, 'crew');
});

test('start gates, secret privacy and snapshot cloning resist client manipulation', () => {
  const { game, ids, events } = setup();
  game.handle(ids[1], 'start', {});
  assert.equal(game.currentPhase, 'lobby');
  assert.equal(events.at(-1)?.type, 'error');
  game.handle(ids[0], 'start', {});
  assert.equal(game.currentPhase, 'playing');
  const snapshot = game.snapshot();
  assert.equal(JSON.stringify(snapshot).includes('allegiance'), false);
  assert.equal(JSON.stringify(snapshot).includes('teammates'), false);
  snapshot.players[0].x = 100;
  assert.notEqual(game.snapshot().players[0].x, 100);
  assert.equal(events.filter(e => e.type === 'secret').length, 3);
});

test('movement is normalized, finite, bounded and stops after input expires', () => {
  const { game, ids, move, advance } = setup(1, true);
  const start = game.snapshot().players[0];
  move(ids[0], 0, -1000, 1000);
  const moved = game.snapshot().players[0];
  assert.ok(Math.abs(Math.abs(moved.z - start.z) - 3.1) < 0.001);
  game.handle(ids[0], 'move', { dx: NaN, dz: Infinity, yaw: Infinity });
  advance(1000);
  assert.deepEqual(game.snapshot().players[0], moved);
  game.handle(ids[0], 'move', { dx: 0, dz: -1, yaw: 0 });
  advance(2000);
  assert.ok(Math.abs(game.snapshot().players[0].z - moved.z) <= 0.8);
  move(ids[0], 0, -1, 15000);
  assert.ok(game.snapshot().players[0].z >= -13.37);
});

test('station challenges enforce proximity, time, token and single completion', () => {
  const { game, ids, events, advance, move } = setup(1, true);
  const id = ids[0]; game.handle(id, 'start', {});
  game.handle(id, 'beginTask', { taskId: 'checklist' });
  assert.equal(events.at(-1)?.type, 'error');
  move(id, 0, 1, 650); // From aft aisle to galley, without crossing obstacles.
  game.handle(id, 'beginTask', { taskId: 'meals' });
  const challenge = events.at(-1)?.payload as TaskChallenge;
  assert.equal(events.at(-1)?.type, 'challenge');
  game.handle(id, 'completeTask', challenge);
  assert.equal(game.snapshot().tasks.find(t => t.id === 'meals')!.completed, false);
  advance(1250);
  game.handle(id, 'completeTask', { ...challenge, token: 'forged' });
  assert.equal(game.snapshot().tasks.find(t => t.id === 'meals')!.completed, false);
  game.handle(id, 'completeTask', challenge);
  assert.equal(game.snapshot().tasks.find(t => t.id === 'meals')!.completed, true);
  game.handle(id, 'completeTask', challenge);
  assert.equal(events.at(-1)?.type, 'error');
});

test('saboteur authorization, cooldown and emergency countdown stay authoritative', () => {
  const { game, ids, advance, events } = setup();
  game.handle(ids[0], 'start', {});
  const saboteur = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  const crew = ids.find(id => id !== saboteur)!;
  game.handle(crew, 'sabotage', { kind: 'blackout' });
  assert.equal(events.at(-1)?.type, 'error');
  game.handle(saboteur, 'sabotage', { kind: 'blackout' });
  assert.equal(game.snapshot().sabotage, null);
  advance(15000);
  game.handle(saboteur, 'sabotage', { kind: 'blackout' });
  assert.equal(game.snapshot().sabotage, 'blackout');
  advance(55200);
  assert.equal(game.currentPhase, 'ended');
  assert.equal(game.snapshot().winner, 'saboteur');
});

test('majority detention ends round and host restart removes old allegiances', () => {
  const { game, ids, advance } = setup();
  game.handle(ids[0], 'start', {});
  const saboteur = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  advance(20050);
  game.handle(ids[0], 'report', {});
  assert.equal(game.currentPhase, 'meeting');
  for (const id of ids) game.handle(id, 'vote', { targetId: saboteur });
  assert.equal(game.snapshot().winner, 'crew');
  game.handle(ids[1], 'restart', {});
  assert.equal(game.currentPhase, 'ended');
  game.handle(ids[0], 'restart', {});
  assert.equal(game.currentPhase, 'lobby');
  assert.ok(ids.every(id => game.getSecret(id).allegiance === 'crew'));
  assert.ok(game.snapshot().players.every(p => !p.detained && !p.ready));
});

test('disconnect reassigns host and cannot leave a departed saboteur blocking victory', () => {
  const { game, ids } = setup();
  game.removePlayer(ids[0]);
  assert.equal(game.snapshot().hostId, ids[1]);
  game.addPlayer('replacement', 'Replacement'); game.handle('replacement', 'ready', {});
  game.handle(ids[1], 'start', {});
  const saboteur = game.snapshot().players.find(p => game.getSecret(p.id).allegiance === 'saboteur')!.id;
  game.removePlayer(saboteur);
  assert.equal(game.snapshot().winner, 'crew');
});

test('comms disruption blocks chat on the server even if a client bypasses its UI', () => {
  const { game, ids, advance, events } = setup();
  game.handle(ids[0], 'start', {}); advance(15000);
  const saboteur = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  game.handle(saboteur, 'sabotage', { kind: 'comms' });
  const before = game.snapshot().chat.length;
  game.handle(ids[0], 'chat', { text: 'Should not reach the room' });
  assert.equal(events.at(-1)?.type, 'error');
  assert.equal(game.snapshot().chat.length, before);
});
