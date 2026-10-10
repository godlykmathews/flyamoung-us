import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { checkFlightServer } from '../client/src/network/connection.js';
import { SAFETY_INSTRUCTIONS, SAFETY_STEP_DURATIONS, type Player, type Secret, type Snapshot, type TaskChallenge, type SafetyChallenge } from '../shared/protocol.js';
import { canStand, NPC_PASSENGER_SEATS, SERVICE_GALLEY, SAFETY_DEMO_STATION, TASKS, WALK_SPEED } from '../shared/world.js';

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
  safetyChallenge: SafetyChallenge | undefined;
  errors: string[] = [];
  snapshots: Snapshot[] = [];
  secrets: Secret[] = [];
  private closed = false;
  private leavePromise: Promise<void> | undefined;
  constructor(readonly room: Room) {
    room.reconnection.maxRetries = 0;
    room.onMessage<Snapshot>('snapshot', value => {
      this.snapshot = value;
      this.snapshots.push(value);
      // Retain enough history for privacy checks without growing with every tick.
      if (this.snapshots.length > 300) this.snapshots.shift();
    });
    room.onMessage<Secret>('secret', value => { this.secret = value; this.secrets.push(value); });
    room.onMessage<TaskChallenge>('challenge', value => { this.challenge = value; });
    room.onMessage<SafetyChallenge>('safetyChallenge', value => { this.safetyChallenge = value; });
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
  assert.match(peer.room.roomId, /^[1-9][0-9]{3}$/);
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
      for (const key of ['allegiance', 'teammates', 'secrets', 'taskChallenges', 'token', 'sequence', 'killCooldown', 'killReadyAt']) {
        assert.equal(serialized.includes(`"${key}":`), false, `public snapshot leaked ${key}`);
      }
    }
  }
}

async function main() {
  console.log(`Testing FLIGHT 404 against ${endpoint}`);
  await checkFlightServer(endpoint);
  const scenario = process.env.TEST_SCENARIO;
  if (scenario && !['multiplayer', 'training', 'concurrency', 'experience'].includes(scenario)) throw new Error('Unknown TEST_SCENARIO');
  if (!scenario || scenario === 'multiplayer') await multiplayerScenario();
  if (!scenario || scenario === 'training') await trainingScenario();
  if (!scenario || scenario === 'experience') await experienceScenario();
  if (!scenario || scenario === 'concurrency') await concurrencyScenario();
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
  loyal.forEach(peer => assert.deepEqual(peer.secret!.objectives, []));
  assert.equal(host.snapshot!.npcs.filter(npc => npc.kind === 'passenger').length, 12);
  assert.equal(host.snapshot!.players.filter(player => player.model === 'attendant-player').length, 1);
  assertPrivateSnapshots(peers);

  const actor = loyal[0]!;
  await expectRejection(actor, 'beginTask', { taskId: 'checklist' }, 'remote task interaction rejected');
  assert.equal(host.snapshot!.tasks.some(task => task.completed), false);
  await expectRejection(actor, 'sabotage', { kind: 'blackout' }, 'crew cannot sabotage');
  await expectRejection(actor, 'killNpc', { npcId: 'attendant-1' }, 'crew cannot kill NPCs');
  await expectRejection(actor, 'impostorTask', { taskId: 'tamper-galley' }, 'crew cannot falsify manifest');
  await expectRejection(saboteur, 'impostorTask', { taskId: 'tamper-galley' }, 'remote manifest action rejected');
  assert.equal(host.snapshot!.sabotage, null);
  await serveRequest(actor);
  await until(() => peers.every(peer => peer.snapshot?.service.served === 1), 'human service replicated');
  await completeSafetyDemo(actor, peers.filter(peer => peer !== actor));
  await until(() => saboteur.secret?.killCooldown === 0, 'initial elimination cooldown expires', 12_000);
  // The AI is a vulnerable occupant too. Pursue it through the open aisle.
  const chaseDeadline = Date.now() + 15_000;
  while (true) {
    const npc = saboteur.snapshot!.npcs.find(npc => npc.id === 'attendant-1')!;
    const dx = npc.x - saboteur.me.x, dz = npc.z - saboteur.me.z, distance = Math.hypot(dx, dz);
    if (distance < 1.25) break;
    assert.ok(Date.now() < chaseDeadline, 'saboteur could not approach attendant');
    saboteur.send('move', { dx: dx / Math.max(distance, .3), dz: dz / Math.max(distance, .3), yaw: 0 }); await sleep(50);
  }
  saboteur.send('move', { dx: 0, dz: 0, yaw: 0 });
  await expectRejection(saboteur, 'killNpc', { npcId: 'attendant-1' }, 'concealed weapon cannot kill');
  saboteur.send('drawWeapon', { drawn: true });
  await until(() => peers.every(peer => peer.snapshot?.players.find(p => p.id === saboteur.room.sessionId)?.weaponDrawn), 'drawn weapon replicates to nearby crew');
  await sleep(650); saboteur.send('killNpc', { npcId: 'attendant-1' });
  await until(() => peers.every(peer => peer.snapshot?.npcs.find(npc => npc.id === 'attendant-1')?.alive === false), 'attendant death replicated');
  const deadAttendant = host.snapshot!.npcs.find(npc => npc.id === 'attendant-1')!;
  assert.equal(deadAttendant.pose, 'dead'); assert.ok(host.snapshot!.npcs.every(npc => npc.request?.claimedBy !== 'attendant-1'));
  await expectRejection(saboteur, 'killNpc', { npcId: 'attendant-1' }, 'repeat kill rejected');
  await expectRejection(saboteur, 'killNpc', { npcId: 'pilot' }, 'kill cooldown enforced');
  await moveTo(saboteur, 0, saboteur.me.z); await moveTo(saboteur, 0, SERVICE_GALLEY.z); await moveTo(saboteur, -1.4, SERVICE_GALLEY.z);
  saboteur.send('impostorTask', { taskId: 'tamper-galley' });
  await until(() => saboteur.secret?.objectives.find(o => o.id === 'tamper-galley')?.completed, 'private galley assignment completes');
  await expectRejection(saboteur, 'impostorTask', { taskId: 'tamper-galley' }, 'manifest action cannot be farmed');
  await until(() => saboteur.secret?.cooldown === 0, 'initial sabotage cooldown expires', 18_000);
  saboteur.send('sabotage', { kind: 'blackout' });
  await until(() => peers.every(peer => peer.snapshot?.sabotage === 'blackout'), 'authorized sabotage replicates');
  await moveTo(actor, 0, actor.me.z); await moveTo(actor, 0, 12.3); await moveTo(actor, 1, 12.3);
  await completeStation(actor, 'electrical');
  await until(() => host.snapshot?.sabotage === null, 'nearby crew task repairs blackout');
  assert.deepEqual(host.snapshot!.npcs.find(npc => npc.id === 'attendant-1'), deadAttendant, 'dead AI never moves or serves');
  await until(() => saboteur.secret?.objectives.every(o => o.completed), 'all three private assignments are complete');
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
  console.log('PASS: ready/start, service delivery, vulnerable AI, private kill/tamper/disruption objectives, sabotage/repair, chat, votes, restart, host migration');
}

async function trainingScenario() {
  const pilot = await create('Training Pilot', true);
  pilot.send('ready', { ready: true });
  await until(() => pilot.me.ready, 'training pilot ready');
  pilot.send('start');
  await until(() => pilot.snapshot?.phase === 'playing' && pilot.secret?.allegiance === 'crew', 'solo training starts without saboteur');
  await expectRejection(pilot, 'completeTask', { taskId: 'checklist', token: 'forged', sequence: [0, 1, 2, 3] }, 'forged challenge rejected');

  for (const task of TASKS) {
    // Approach side stations from the clear aisle after reaching their row.
    await moveTo(pilot, 0, pilot.me.z);
    await moveTo(pilot, 0, task.z);
    if (Math.abs(task.x) > 2) await moveTo(pilot, Math.sign(task.x), task.z);
    await completeStation(pilot, task.id);
    await until(() => pilot.snapshot?.tasks.find(value => value.id === task.id)?.completed, `${task.id} completes`);
  }
  assert.equal(pilot.snapshot!.phase, 'playing', 'legacy stations cannot skip journey');
  await moveTo(pilot, 0, pilot.me.z); await moveTo(pilot, 0, 15.5); await moveTo(pilot, -1.25, 15.5);
  await holdAction(pilot, 'secure-cart', 'service-cart', 3200);
  await guideStanding(pilot);
  await completeSafetyDemo(pilot);
  await until(() => pilot.snapshot?.story.stage === 'service', 'departure transitions to service');
  await serveRequest(pilot, true);
  await until(() => pilot.snapshot?.story.stage === 'turbulence', 'human service advances story');
  await guideStanding(pilot);
  await moveTo(pilot, 0, pilot.me.z); await moveTo(pilot, 0, 12.3); await moveTo(pilot, 1, 12.3);
  await holdAction(pilot, 'secure-equipment', 'equipment-locker', 4200);
  await until(() => pilot.snapshot?.experience.incident === 'decompression', 'natural cabin pressure incident during turbulence');
  await moveTo(pilot, 0, pilot.me.z); await moveTo(pilot, 0, 7.5);
  await holdExperience(pilot, 'use-mask', pilot.room.sessionId, 2200);
  await moveTo(pilot, 0, 9.4); await moveTo(pilot, 1, 9.4);
  await holdExperience(pilot, 'repair-pressure', 'pressure', 6200);
  assert.equal(pilot.snapshot!.experience.incident, 'none');
  await moveTo(pilot, 0, pilot.me.z); await moveTo(pilot, 0, -11.6);
  const controlDeadline = Date.now() + 25_000;
  while (pilot.snapshot?.story.stage === 'turbulence') {
    assert.ok(Date.now() < controlDeadline, 'sustained flight correction did not stabilize');
    const f = pilot.snapshot.story.turbulence;
    pilot.send('flightControl', { roll: -f.roll * 3, pitch: -f.pitch * 3 }); await sleep(100);
  }
  assert.equal(pilot.snapshot!.story.stage, 'approach');
  await moveTo(pilot, 0, -8.5); await holdAction(pilot, 'cabin-check', 'cabin-check', 4200);
  await until(() => pilot.snapshot?.phase === 'ended', 'full story ends training round');
  assert.equal(pilot.snapshot!.winner, 'crew');
  assert.equal(pilot.snapshot!.tasks.filter(task => task.completed).length, TASKS.length);
  assertPrivateSnapshots([pilot]);
  await pilot.leave();
  console.log('PASS: solo training, five supporting stations, safety card arrangement and timed demonstration, sustained world actions, walking/seated passengers, human service, flight control and full journey victory');
}

async function holdExperience(peer: Peer, kind: string, targetId: string, milliseconds: number) {
  peer.send('experienceAction', { phase: 'begin', kind, targetId });
  await until(() => peer.snapshot?.experience.actions.some(action => action.playerId === peer.room.sessionId), `${kind} started`);
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { peer.send('experienceAction', { phase: 'maintain' }); await sleep(150); }
  await until(() => !peer.snapshot?.experience.actions.some(action => action.playerId === peer.room.sessionId), `${kind} completed`);
}

async function experienceScenario() {
  const host = await create('Experience host'), second = await join(host, 'Passenger'), third = await join(host, 'Crew');
  const peers = [host, second, third]; peers.forEach(peer => peer.send('ready', { ready: true }));
  await until(() => host.snapshot?.players.every(player => player.ready), 'experience crew ready'); host.send('start');
  await until(() => peers.every(peer => peer.snapshot?.phase === 'playing' && peer.secret) && peers.some(peer => peer.secret?.allegiance === 'saboteur'), 'experience flight started');
  const sab = peers.find(peer => peer.secret?.allegiance === 'saboteur')!, [crew, passenger] = peers.filter(peer => peer !== sab);
  await expectRejection(crew, 'incidentDrill', { kind: 'smoke' }, 'multiplayer cannot invoke practice drills');
  for (const item of ['water', 'coffee', 'meal', 'blanket']) {
    passenger.send('requestService', { item }); await until(() => crew.snapshot?.experience.players[passenger.room.sessionId].order?.item === item, `${item} order replicated`);
    const request = passenger.snapshot!.experience.players[passenger.room.sessionId].order!;
    await expectRejection(passenger, 'requestService', { item }, 'outstanding order cannot be replaced');
    await moveTo(crew, 0, crew.me.z); await moveTo(crew, 0, 9.4); await moveTo(crew, -1.4, 9.4);
    crew.send('pickUpService', { item }); await until(() => crew.me.carriedItem === item, `${item} collected`);
    await moveTo(crew, 0, 9.4); await moveTo(crew, 0, passenger.me.z);
    crew.send('servePlayer', { playerId: passenger.room.sessionId, requestId: request.id });
    await until(() => peers.every(peer => peer.snapshot?.experience.players[passenger.room.sessionId].received.includes(item as 'water')), `${item} delivered to player on all clients`);
  }
  assert.equal(passenger.snapshot!.experience.players[passenger.room.sessionId].received.length, 4);
  await holdExperience(passenger, 'read', passenger.room.sessionId, 3200);
  assert.equal(crew.snapshot!.experience.players[passenger.room.sessionId].activity, 'reading');
  await moveTo(sab, 0, sab.me.z); await moveTo(sab, 0, 9.4); await moveTo(sab, 1, 9.4);
  sab.send('experienceAction', { phase: 'begin', kind: 'damage-pressure', targetId: 'pressure' });
  await until(() => crew.snapshot?.experience.actions.some(action => action.playerId === sab.room.sessionId), 'covert work has public generic progress');
  const visibleAction = crew.snapshot!.experience.actions.find(action => action.playerId === sab.room.sessionId)!;
  assert.equal(visibleAction.kind, 'working'); assert.equal(visibleAction.targetId, '');
  const damageDeadline = Date.now() + 4300;
  while (Date.now() < damageDeadline) { sab.send('experienceAction', { phase: 'maintain' }); await sleep(150); }
  await until(() => peers.every(peer => peer.snapshot?.experience.incident === 'decompression' && peer.snapshot.experience.masksDeployed), 'pressure incident and masks replicated');
  await holdExperience(crew, 'use-mask', crew.room.sessionId, 2200);
  await moveTo(crew, 0, passenger.me.z); await holdExperience(crew, 'assist-mask', passenger.room.sessionId, 3200);
  assert.equal(passenger.snapshot!.experience.players[passenger.room.sessionId].oxygenMask, true);
  await moveTo(sab, 0, 9.4); await moveTo(sab, 0, passenger.me.z);
  sab.send('drawWeapon', { drawn: true }); await until(() => crew.snapshot?.players.find(p => p.id === sab.room.sessionId)?.weaponDrawn, 'exposed weapon replicates');
  await sleep(650); sab.send('attackPlayer', { playerId: passenger.room.sessionId });
  await until(() => peers.every(peer => peer.snapshot?.experience.players[passenger.room.sessionId].incapacitated), 'human victim incapacitated on all clients');
  const victimPosition = { x: passenger.me.x, z: passenger.me.z }; passenger.send('move', { dx: 0, dz: 1, yaw: 0 }); await sleep(400);
  assert.equal(passenger.me.x, victimPosition.x); assert.equal(passenger.me.z, victimPosition.z);
  await holdExperience(crew, 'rescue-player', passenger.room.sessionId, 4200);
  assert.equal(passenger.snapshot!.experience.players[passenger.room.sessionId].incapacitated, false);
  const defender = [crew, passenger].find(peer => ['Captain', 'First Officer', 'Air Marshal'].includes(peer.me.role))!;
  await holdExperience(defender, 'disarm', sab.room.sessionId, 2700);
  await until(() => host.snapshot?.players.find(p => p.id === sab.room.sessionId)?.detained, 'exposed attacker detained');
  assert.equal(host.snapshot!.phase, 'playing', 'emergency still blocks victory after attacker detention');
  await moveTo(crew, 0, crew.me.z); await moveTo(crew, 0, 9.4); await moveTo(crew, 1, 9.4);
  await holdExperience(crew, 'repair-pressure', 'pressure', 6200);
  await until(() => peers.every(peer => peer.snapshot?.phase === 'ended' && peer.snapshot.winner === 'crew'), 'resolved pressure and attacker detention secure flight');
  assertPrivateSnapshots(peers); await Promise.all(peers.map(peer => peer.leave()));
  console.log('PASS: four player orders, human delivery, reading, covert privacy, pressure/masks, assistance, player attack/rescue, role-gated disarm and emergency victory gating');
}

async function completeSafetyDemo(peer: Peer, observers: Peer[] = []) {
  await moveTo(peer, 0, peer.me.z); await moveTo(peer, SAFETY_DEMO_STATION.x, SAFETY_DEMO_STATION.z);
  peer.send('beginSafety'); await until(() => peer.safetyChallenge, 'private safety puzzle delivered');
  const challenge = peer.safetyChallenge!;
  for (const observer of observers) assert.equal(observer.safetyChallenge, undefined, 'safety challenge must stay private');
  await until(() => observers.every(observer => observer.snapshot?.safety.status === 'arranging' && observer.snapshot.safety.operatorId === peer.room.sessionId), 'safety preparation ownership replicates');
  await expectRejection(peer, 'submitSafety', { token: challenge.token, order: challenge.cards }, 'incorrect safety order rejected');
  peer.send('submitSafety', { token: challenge.token, order: SAFETY_INSTRUCTIONS.map(card => card.id) });
  await until(() => peer.snapshot?.safety.status === 'demonstrating', 'shared safety performance starts');
  await until(() => observers.every(observer => observer.snapshot?.safety.status === 'demonstrating'), 'crew sees the same safety performance');
  peer.send('move', { dx: 0, dz: 1, yaw: 0 }); await sleep(400);
  assert.equal(peer.me.x, SAFETY_DEMO_STATION.x); assert.equal(peer.me.z, SAFETY_DEMO_STATION.z);
  await until(() => peer.snapshot?.safety.status === 'complete', 'all four safety animations finish before credit', SAFETY_STEP_DURATIONS.reduce((sum, duration) => sum + duration, 0) * 1000 + 2000);
  await until(() => observers.every(observer => observer.snapshot?.safety.status === 'complete'), 'demonstration completion replicates');
}

async function serveRequest(peer: Peer, storyOnly = false) {
  const servedBefore = peer.snapshot!.service.served;
  await expectRejection(peer, 'pickUpService', { item: 'water' }, 'remote galley pickup rejected');
  await until(() => peer.snapshot?.npcs.some(npc => npc.request && (!storyOnly || npc.request.remaining > 76)), 'passenger requests service', storyOnly ? 30_000 : 8_000);
  const passenger = peer.snapshot!.npcs.find(npc => npc.request && (!storyOnly || npc.request.remaining > 76))!, request = { ...passenger.request! };
  await expectRejection(peer, 'servePassenger', { npcId: passenger.id, requestId: request.id }, 'delivery requires item and proximity');
  await moveTo(peer, 0, peer.me.z); await moveTo(peer, 0, SERVICE_GALLEY.z); await moveTo(peer, -1.4, SERVICE_GALLEY.z);
  await expectRejection(peer, 'pickUpService', { item: 'invalid-item' }, 'unknown service supplies rejected');
  peer.send('pickUpService', { item: request.item }); await until(() => peer.me.carriedItem === request.item, 'server records held service item');
  const seat = NPC_PASSENGER_SEATS.find(seat => seat.id === passenger.id)!;
  await moveTo(peer, 0, peer.me.z); await moveTo(peer, 0, seat.serviceZ); await moveTo(peer, seat.serviceX, seat.serviceZ);
  await expectRejection(peer, 'servePassenger', { npcId: passenger.id, requestId: 'stale-request' }, 'stale passenger request rejected');
  peer.send('servePassenger', { npcId: passenger.id, requestId: request.id });
  await until(() => peer.snapshot!.service.served > servedBefore && peer.me.carriedItem === null, 'matching passenger delivery accepted');
  await expectRejection(peer, 'servePassenger', { npcId: passenger.id, requestId: request.id }, 'repeated passenger delivery rejected');
}

async function holdAction(peer: Peer, kind: string, targetId: string, milliseconds: number) {
  peer.send('beginAction', { kind, targetId });
  await until(() => peer.snapshot?.interactions.some(a => a.playerId === peer.room.sessionId), `${kind} started`);
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { peer.send('maintainAction'); await sleep(150); }
  await until(() => !peer.snapshot?.interactions.some(a => a.playerId === peer.room.sessionId), `${kind} completed`);
}
async function guideStanding(peer: Peer) {
  await until(() => peer.snapshot?.npcs.some(n => n.needsSeat), 'passenger stands in aisle', 12_000);
  for (let i = 0; i < 5; i++) {
    const npc = peer.snapshot!.npcs.find(n => n.needsSeat);
    if (!npc) break;
    await moveTo(peer, 0, peer.me.z); await moveTo(peer, 0, npc.z);
    await holdAction(peer, 'guide-passenger', npc.id, 2700);
  }
  await until(() => peer.snapshot!.npcs.filter(n => n.kind === 'passenger' && n.alive).every(n => n.pose === 'seated'), 'passengers return to exact seats', 8_000);
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
    assert.ok(distance > 1.5, `client ${index} moved too slowly; check simulation-clock timing`);
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
