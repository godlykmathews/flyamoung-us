import assert from 'node:assert/strict';
import test from 'node:test';
import { canStand, movePlayer, nearestTask, OBSTACLES, PLAYER_RADIUS, TASKS, WALK_SPEED } from '../shared/world.js';

test('the central aisle connects the full aircraft interior', () => {
  for (let z = -13.3; z <= 13.5; z += 0.1) {
    assert.equal(canStand(0, z), true, `aisle is blocked at z=${z}`);
  }
});

test('walls and furniture exclude the full player radius', () => {
  assert.equal(canStand(3, 0), false);
  assert.equal(canStand(0, -14), false);
  assert.equal(canStand(0, 14), false);
  for (const obstacle of OBSTACLES) {
    assert.equal(canStand(obstacle.x, obstacle.z), false);
    assert.equal(canStand(obstacle.x + obstacle.w / 2 + PLAYER_RADIUS / 2, obstacle.z), false);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(canStand(invalid, 0), false);
    assert.equal(canStand(0, invalid), false);
  }
});

test('diagonal movement is normalized and a long frame is capped', () => {
  const diagonal = movePlayer(0, 0, 1, 1, 0.05);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - WALK_SPEED * 0.05) < 1e-8);
  const longFrame = movePlayer(0, 0, 0, 1, 30);
  assert.ok(Math.abs(longFrame.z - WALK_SPEED * 0.1) < 1e-8);
  assert.deepEqual(movePlayer(0, 0, 0, 1, -1), { x: 0, z: 0 });
});

test('collisions stop crossing seats while allowing movement along the aisle', () => {
  let position = { x: 0, z: -7 };
  for (let step = 0; step < 20; step++) position = movePlayer(position.x, position.z, 1, 0, 0.1);
  assert.ok(position.x <= 0.85 - PLAYER_RADIUS + 1e-8);
  const slid = movePlayer(position.x, position.z, 1, 1, 0.1);
  assert.equal(slid.x, position.x);
  assert.ok(slid.z > position.z);
  assert.equal(canStand(slid.x, slid.z), true);
});

test('every task has a reachable position in its interaction radius', () => {
  for (const task of TASKS) {
    let reachable = false;
    for (let x = -2.7; x <= 2.7; x += 0.15) {
      for (let z = task.z - 2; z <= task.z + 2; z += 0.15) {
        if (canStand(x, z) && nearestTask(x, z)?.id === task.id) reachable = true;
      }
    }
    assert.equal(reachable, true, `no reachable interaction point for ${task.id}`);
  }
  assert.equal(nearestTask(0, 2), undefined);
});
