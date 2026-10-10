import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARDING_DOCUMENTS, BOARDING_ENTRANCE } from '../shared/protocol.js';
import {
  moveTerminal, reconcileTerminalPosition, TERMINAL_BOUNDS,
  TERMINAL_PREDICTION_SNAP_DISTANCE, TERMINAL_WALK_SPEED,
} from '../shared/terminalMovement.js';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('terminal diagonal and oversized inputs preserve the authoritative walk speed', () => {
  for (const [dx, dz] of [[1, 0], [1, 1], [-1, 1], [30, -40]]) {
    const next = moveTerminal(0, 10, dx, dz, .05);
    close(Math.hypot(next.x, next.z - 10), TERMINAL_WALK_SPEED * .05);
  }
  close(moveTerminal(0, 10, .25, 0, .1).x, TERMINAL_WALK_SPEED * .025);
});

test('terminal simulation caps long frames and rejects invalid movement components', () => {
  assert.deepEqual(moveTerminal(0, 10, 0, 1, 30), moveTerminal(0, 10, 0, 1, .1));
  for (const seconds of [-1, NaN, Infinity, -Infinity]) assert.deepEqual(moveTerminal(0, 10, 1, 1, seconds), { x: 0, z: 10 });
  assert.deepEqual(moveTerminal(0, 10, NaN, Infinity, .1), { x: 0, z: 10 });
});

test('terminal walls stop outward input and allow sliding along a boundary', () => {
  assert.deepEqual(moveTerminal(5, 14, 1, 1, .1), { x: 5, z: 14 });
  assert.deepEqual(moveTerminal(-5, 4, -1, -1, .1), { x: -5, z: 4 });
  const slide = moveTerminal(5, 10, 1, 1, .1);
  assert.equal(slide.x, 5);
  close(slide.z, 10 + TERMINAL_WALK_SPEED * .1 / Math.SQRT2);
  assert.deepEqual(moveTerminal(25, -25, 0, 0, .1), { x: TERMINAL_BOUNDS.maxX, z: TERMINAL_BOUNDS.minZ });
});

test('client frame prediction and fixed server steps cover the same terminal distance', () => {
  let client = { x: -2.4, z: 11 }, server = { ...client };
  for (let frame = 0; frame < 60; frame++) client = moveTerminal(client.x, client.z, .3, -.4, 1 / 60);
  for (let tick = 0; tick < 20; tick++) server = moveTerminal(server.x, server.z, .3, -.4, .05);
  close(client.x, server.x);
  close(client.z, server.z);
});

test('the bounded terminal can reach documents and the boarding scanner from every spawn', () => {
  for (let slot = 0; slot < 10; slot++) {
    let position = { x: (slot % 5 - 2) * 1.2, z: 11 + Math.floor(slot / 5) * 1.1 };
    for (const station of [BOARDING_DOCUMENTS, BOARDING_ENTRANCE]) {
      for (let tick = 0; tick < 200 && Math.hypot(position.x - station.x, position.z - station.z) >= station.radius; tick++) {
        const distance = Math.hypot(station.x - position.x, station.z - position.z);
        position = moveTerminal(position.x, position.z, (station.x - position.x) / distance, (station.z - position.z) / distance, .05);
      }
      assert.ok(Math.hypot(position.x - station.x, position.z - station.z) < station.radius, `spawn ${slot} cannot reach boarding station`);
    }
  }
});

test('ordinary snapshots do not rewind a moving terminal prediction', () => {
  const predicted = { x: -2.4, z: 9.9 }, authoritative = { x: -2.4, z: 10.21 };
  for (let frame = 0; frame < 6; frame++) {
    assert.deepEqual(reconcileTerminalPosition(predicted, authoritative, 1 / 60, true), { ...predicted, snapped: false });
  }
});

test('stopped prediction settles smoothly without overshooting the server position', () => {
  const authoritative = { x: -2.4, z: 10 };
  let prediction = { x: -2.1, z: 9.6 };
  for (let frame = 0; frame < 60; frame++) {
    const previousError = Math.hypot(prediction.x - authoritative.x, prediction.z - authoritative.z);
    const next = reconcileTerminalPosition(prediction, authoritative, 1 / 60, false);
    assert.equal(next.snapped, false);
    assert.ok(next.x >= authoritative.x && next.x <= prediction.x);
    assert.ok(next.z <= authoritative.z && next.z >= prediction.z);
    assert.ok(Math.hypot(next.x - authoritative.x, next.z - authoritative.z) <= previousError);
    prediction = next;
  }
  assert.ok(Math.hypot(prediction.x - authoritative.x, prediction.z - authoritative.z) < .00001);
});

test('large corrections and invalid prediction snap to the authoritative spawn', () => {
  const authoritative = { x: -.35, z: 7.3 };
  assert.deepEqual(reconcileTerminalPosition({ x: -2.4, z: 11 }, authoritative, .016, true), { ...authoritative, snapped: true });
  assert.deepEqual(reconcileTerminalPosition({ x: NaN, z: 11 }, authoritative, .016, false), { ...authoritative, snapped: true });
  const within = { x: 0, z: 10 }, edge = { x: TERMINAL_PREDICTION_SNAP_DISTANCE, z: 10 };
  assert.deepEqual(reconcileTerminalPosition(within, edge, .016, true), { ...within, snapped: false });
});

test('reconciliation uses frame-independent damping with capped and invalid frame times', () => {
  const start = { x: 0, z: 10 }, server = { x: .5, z: 10 };
  const one = reconcileTerminalPosition(start, server, .1, false);
  let two = reconcileTerminalPosition(start, server, .05, false);
  two = reconcileTerminalPosition(two, server, .05, false);
  close(one.x, two.x);
  assert.deepEqual(reconcileTerminalPosition(start, server, 30, false), one);
  for (const seconds of [-1, NaN, Infinity]) assert.deepEqual(reconcileTerminalPosition(start, server, seconds, false), { ...start, snapped: false });
});
