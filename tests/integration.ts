import assert from 'node:assert/strict';
import { Client, type Room } from 'colyseus.js';
import type { Player, Secret, Snapshot, TaskChallenge } from '../shared/protocol.js';
import { canStand, TASKS, WALK_SPEED } from '../shared/world.js';

const endpoint = process.env.COLYSEUS_URL || 'ws://localhost:2567';
const clients: Peer[] = [];
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function until(condition: () => unknown, description: string, timeout = 5_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await sleep(25);
  }
}

class Peer {
  snapshot: Snapshot | undefined;
  secret: Secret | undefined;
  challenge: TaskChallenge | undefined;
  errors: string[] = [];
  snapshots: Snapshot[] = [];
  secrets: Secret[] = [];
  private closed = false;
  private leavePromise: Promise<void> | undefined;
  constructor(readonly room: Room) {
    room.onMessage<Snapshot>('snapshot', value => {
      this.snapshot = value;
      this.snapshots.push(value);
      // Retain enough history for privacy checks without growing with every tick.
      if (this.snapshots.length > 300) this.snapshots.shift();
    });
    room.onMessage<Secret>('secret', value => { this.secret = value; this.secrets.push(value); });
    room.onMessage<TaskChallenge>('challenge', value => { this.challenge = value; });
    room.onMessage<{ message?: string } | string>('error', value => {
      this.errors.push(typeof value === 'string' ? value : value.message || 'Action rejected');
    });
    room.onError((code, message) => this.errors.push(`${code}: ${message}`));
    room.onLeave(() => { this.closed = true; });
    room.send('sync');
    clients.push(this);
  }
  get me(): Player {
    const player = this.snapshot?.players.find(value => value.id === this.room.sessionId);
    assert.ok(player, `player ${this.room.sessionId} missing from snapshot`);
    return player;
  }
  send(type: string, value: unknown = {}) { this.room.send(type, value); }
  async leave() {
    if (this.closed) return;
    this.leavePromise ||= this.room.leave().then(() => undefined);
    await this.leavePromise;
  }
}

async function create(name: string, training = false) {
  const peer = new Peer(await new Client(endpoint).create('flight', { name, training }));
  await until(() => peer.snapshot, `${name} initial snapshot`);
  return peer;
}

async function join(host: Peer, name: string) {
  const peer = new Peer(await new Client(endpoint).joinById(host.room.roomId, { name }));
  await until(() => peer.snapshot, `${name} joined snapshot`);
  return peer;
}

async function expectRejection(peer: Peer, type: string, payload: unknown, description: string) {
  const count = peer.errors.length;
  peer.send(type, payload);
  await until(() => peer.errors.length > count, description);
}

async function moveTo(peer: Peer, x: number, z: number) {
  const deadline = Date.now() + 15_000;
  while (Math.hypot(peer.me.x - x, peer.me.z - z) > 0.16) {
    assert.ok(Date.now() < deadline, `could not reach (${x}, ${z}); at (${peer.me.x}, ${peer.me.z})`);
    const dx = x - peer.me.x, dz = z - peer.me.z;
    const length = Math.hypot(dx, dz);
    peer.send('move', { dx: dx / Math.max(length, 0.3), dz: dz / Math.max(length, 0.3), yaw: 0 });
    await sleep(50);
  }
  peer.send('move', { dx: 0, dz: 0, yaw: 0 });
  await sleep(100);
}

function assertPrivateSnapshots(peers: Peer[]) {
  for (const peer of peers) {
    for (const snapshot of peer.snapshots) {
      const serialized = JSON.stringify(snapshot);
      for (const key of ['allegiance', 'teammates', 'secrets', 'taskChallenges', 'token', 'sequence']) {
        assert.equal(serialized.includes(`"${key}":`), false, `public snapshot leaked ${key}`);
      }
    }
  }
}

async function main() {
  console.log(`Testing FLIGHT 404 against ${endpoint}`);
  await multiplayerScenario();
  await trainingScenario();
  await concurrencyScenario();
  console.log('PASS: all live multiplayer integration checks');
}

// Scenarios intentionally run serially: each has a separate real server room.
async function multiplayerScenario() {
  const host = await create('Host');
  const second = await join(host, 'Crew Two');
  const third = await join(host, 'Crew Three');
  const peers = [host, second, third];
  await until(() => peers.every(peer => peer.snapshot?.players.length === 3), 'three-player lobby');
  await expectRejection(second, 'start', {}, 'only the host may start');
  await expectRejection(host, 'start', {}, 'unready crew cannot depart');
  peers.forEach(peer => peer.send('ready', { ready: true }));
  await until(() => host.snapshot?.players.every(player => player.ready), 'all crew ready');
  host.send('start');
  await until(() => peers.every(peer => peer.snapshot?.phase === 'playing' && peer.secret) && peers.some(peer => peer.secret?.allegiance === 'saboteur'), 'round started with private allegiances');
  const roundStarted = Date.now();
  const saboteurs = peers.filter(peer => peer.secret?.allegiance === 'saboteur');
  assert.equal(saboteurs.length, 1, 'three players should have one saboteur');
  const saboteur = saboteurs[0]!;
  const loyal = peers.filter(peer => peer.secret?.allegiance === 'crew');
  assert.equal(loyal.length, 2);
  assert.ok(new Set(host.snapshot!.players.map(player => player.role)).size > 1, 'crew roles must be public and varied');
  loyal.forEach(peer => assert.deepEqual(peer.secret!.teammates, []));
  assertPrivateSnapshots(peers);

  const actor = loyal[0]!;
  await expectRejection(actor, 'beginTask', { taskId: 'checklist' }, 'remote task interaction rejected');
  assert.equal(host.snapshot!.tasks.some(task => task.completed), false);
  await expectRejection(actor, 'sabotage', { kind: 'blackout' }, 'crew cannot sabotage');
  assert.equal(host.snapshot!.sabotage, null);
  await until(() => saboteur.secret?.cooldown === 0, 'initial sabotage cooldown expires', 18_000);
  saboteur.send('sabotage', { kind: 'blackout' });
  await until(() => peers.every(peer => peer.snapshot?.sabotage === 'blackout'), 'authorized sabotage replicates');
  await moveTo(actor, 0, 12.3);
  await completeStation(actor, 'electrical');
  await until(() => host.snapshot?.sabotage === null, 'nearby crew task repairs blackout');
  peers.filter(peer => peer !== actor).forEach(peer => assert.equal(peer.challenge, undefined, 'task challenge leaked to another player'));

  actor.send('chat', { text: 'Power restored. Meet in the cabin.' });
  await until(() => third.snapshot?.chat.some(message => message.text === 'Power restored. Meet in the cabin.'), 'intercom replicated');
  await sleep(Math.max(0, 20_500 - (Date.now() - roundStarted)));
  actor.send('report');
  await until(() => peers.every(peer => peer.snapshot?.phase === 'meeting'), 'emergency meeting');
  await expectRejection(actor, 'vote', { targetId: 'missing-player' }, 'invalid vote target rejected');
  peers.forEach(peer => peer.send('vote', { targetId: saboteur.room.sessionId }));
  await until(() => host.snapshot?.phase === 'ended', 'majority detains last saboteur');
  assert.equal(host.snapshot!.winner, 'crew');
  assert.equal(host.snapshot!.players.find(player => player.id === saboteur.room.sessionId)?.detained, true);
  assertPrivateSnapshots(peers);

  await expectRejection(second, 'restart', {}, 'only host can restart');
  host.send('restart');
  await until(() => peers.every(peer => peer.snapshot?.phase === 'lobby'), 'round restarts into lobby');
  assert.equal(host.snapshot!.players.some(player => player.ready || player.detained), false);
  assert.equal(host.snapshot!.tasks.some(task => task.completed), false);
  await host.leave();
  await until(() => second.snapshot?.players.length === 2 && second.snapshot.hostId !== host.room.sessionId, 'disconnect transfers host');
  assert.ok(second.snapshot!.players.some(player => player.id === second.snapshot!.hostId));
  await Promise.all([second.leave(), third.leave()]);
  console.log('PASS: ready/start, private allegiance, task proximity, sabotage/repair, chat, votes, restart, host migration');
}

async function trainingScenario() {
  const pilot = await create('Training Pilot', true);
  pilot.send('ready', { ready: true });
  await until(() => pilot.me.ready, 'training pilot ready');
  pilot.send('start');
  await until(() => pilot.snapshot?.phase === 'playing' && pilot.secret?.allegiance === 'crew', 'solo training starts without saboteur');
  await expectRejection(pilot, 'completeTask', { taskId: 'checklist', token: 'forged', sequence: [0, 1, 2, 3] }, 'forged challenge rejected');

  for (const task of TASKS) {
    // Task stations lie within reach of the unobstructed central aisle.
    await moveTo(pilot, 0, task.z);
    await completeStation(pilot, task.id);
    await until(() => pilot.snapshot?.tasks.find(value => value.id === task.id)?.completed, `${task.id} completes`);
  }
  await until(() => pilot.snapshot?.phase === 'ended', 'all tasks end training round');
  assert.equal(pilot.snapshot!.winner, 'crew');
  assert.equal(pilot.snapshot!.tasks.filter(task => task.completed).length, TASKS.length);
  assertPrivateSnapshots([pilot]);
  await pilot.leave();
  console.log('PASS: solo training, challenge validation, all five reachable tasks, crew victory');
}

async function completeStation(peer: Peer, taskId: string) {
  peer.challenge = undefined;
  peer.send('beginTask', { taskId });
  await until(() => peer.challenge?.taskId === taskId, `${taskId} challenge delivered privately`);
  const challenge = peer.challenge!;
  assert.equal(challenge.sequence.length, 4);
  assert.ok(challenge.token.length > 8);
  await sleep(1_500);
  peer.send('completeTask', { taskId, token: challenge.token, sequence: challenge.sequence });
}

async function concurrencyScenario() {
  const host = await create('Load 01');
  const others = await Promise.all(Array.from({ length: 9 }, (_, index) => join(host, `Load ${index + 2}`)));
  const peers = [host, ...others];
  await until(() => peers.every(peer => peer.snapshot?.players.length === 10), 'ten connected clients');
  peers.forEach(peer => peer.send('ready', { ready: true }));
  await until(() => host.snapshot?.players.every(player => player.ready), 'ten clients ready');
  host.send('start');
  await until(() => peers.every(peer => peer.snapshot?.phase === 'playing' && peer.secret) && peers.filter(peer => peer.secret?.allegiance === 'saboteur').length === 2, 'ten-player round starts');
  const saboteurs = peers.filter(peer => peer.secret?.allegiance === 'saboteur');
  peers.forEach(peer => assert.deepEqual(peer.secret!.teammates.sort(), peer.secret!.allegiance === 'crew' ? [] : saboteurs.filter(other => other !== peer).map(other => other.room.sessionId).sort()));
  const starts = peers.map(peer => ({ x: peer.me.x, z: peer.me.z }));
  const began = Date.now();
  for (let step = 0; step < 16; step++) {
    peers.forEach(peer => peer.send('move', { dx: 0, dz: -1_000, yaw: 0 }));
    await sleep(50);
  }
  peers.forEach(peer => peer.send('move', { dx: 0, dz: 0, yaw: 0 }));
  await sleep(150);
  const elapsed = (Date.now() - began) / 1_000;
  peers.forEach((peer, index) => {
    const distance = Math.hypot(peer.me.x - starts[index]!.x, peer.me.z - starts[index]!.z);
    assert.ok(distance > 0.4, `client ${index} did not move`);
    assert.ok(distance <= WALK_SPEED * elapsed + 0.3, `client ${index} bypassed server movement speed`);
    assert.equal(canStand(peer.me.x, peer.me.z), true);
  });
  const movingPeer = peers[1]!;
  const replicated = host.snapshot!.players.find(player => player.id === movingPeer.room.sessionId)!;
  assert.ok(Math.abs(replicated.z - movingPeer.me.z) < 0.2, 'remote movement is consistent');
  assertPrivateSnapshots(peers);
  await assert.rejects(() => new Client(endpoint).joinById(host.room.roomId, { name: 'Late Arrival' }));
  await peers[9]!.leave();
  await until(() => host.snapshot?.players.length === 9, 'disconnect removed from replicated state');
  await Promise.allSettled(peers.slice(0, 9).map(peer => peer.leave()));
  console.log('PASS: ten-client concurrent movement, speed normalization, replicated positions, locked joins, disconnect');
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(peer => peer.leave()));
}
