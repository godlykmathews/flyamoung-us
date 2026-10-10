import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPlayDeparture } from '../client/src/game/departure.js';
import type { Phase } from '../shared/protocol.js';

const snapshot = (phase: Phase, roomId = 'flight-404') => ({ phase, roomId });

test('each client observes departure when its room starts playing', () => {
  assert.equal(shouldPlayDeparture(snapshot('lobby'), snapshot('playing')), true);
});

test('resuming play after a meeting never repeats departure', () => {
  assert.equal(shouldPlayDeparture(snapshot('playing'), snapshot('meeting')), false);
  assert.equal(shouldPlayDeparture(snapshot('meeting'), snapshot('playing')), false);
});

test('a new round departs once after the crew returns to the lobby', () => {
  const phases: Phase[] = ['playing', 'ended', 'lobby', 'lobby', 'playing', 'playing'];
  const departures = phases.slice(1).map((phase, index) =>
    shouldPlayDeparture(snapshot(phases[index]!), snapshot(phase)),
  );
  assert.deepEqual(departures, [false, false, false, true, false]);
});

test('leaving or receiving the first snapshot cannot launch departure', () => {
  assert.equal(shouldPlayDeparture(snapshot('lobby'), null), false);
  assert.equal(shouldPlayDeparture(snapshot('playing'), null), false);
  assert.equal(shouldPlayDeparture(null, snapshot('lobby')), false);
  assert.equal(shouldPlayDeparture(null, snapshot('playing')), false);
  assert.equal(shouldPlayDeparture(null, null), false);
});

test('switching rooms cannot mistake a different running flight for departure', () => {
  assert.equal(shouldPlayDeparture(snapshot('lobby', 'old-flight'), snapshot('playing', 'new-flight')), false);
});

test('repeated snapshots and nondeparture phase changes do not replay the intro', () => {
  const phases: Phase[] = ['lobby', 'playing', 'meeting', 'ended'];
  for (const previous of phases) {
    for (const current of phases) {
      assert.equal(
        shouldPlayDeparture(snapshot(previous), snapshot(current)),
        previous === 'lobby' && current === 'playing',
        `${previous} → ${current}`,
      );
    }
  }
});
