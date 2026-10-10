import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { JourneySimulation } from '../server/src/systems/story.js';
import { canDoTask, canPerformDuty } from '../shared/duties.js';
import { TASKS, canStand, hasCabinSight, SAFETY_DEMO_STATION } from '../shared/world.js';
import { type Role, type Player, type TaskChallenge, type JourneyStage, SAFETY_INSTRUCTIONS } from '../shared/protocol.js';

const roles: Role[] = ['Captain', 'First Officer', 'Cabin Crew', 'Engineer', 'Air Marshal', 'Passenger'];
function setup(training = false) {
  let now = 0;
  const events: Array<{ id: string; type: string; payload: any }> = [];
  const game = new FlightGame('ROLE', training, (id, type, payload) => events.push({ id, type, payload }), () => now);
  for (let i = 0; i < (training ? 1 : 6); i++) { game.addPlayer(`p${i}`, `P${i}`); game.handle(`p${i}`, 'ready', { ready: true }); }
  game.handle('p0', 'start', {});
  // Unit fixtures arrange stage and positions directly to isolate authorization.
  // All actions under test still enter through the same raw message dispatcher
  // used by Colyseus. Walking, collision and journey progression have separate tests.
  const internals = game as unknown as { players: Map<string, Player>; story: JourneySimulation };
  const player = (role: Role) => training ? internals.players.get('p0')! : [...internals.players.values()].find(p => p.role === role)!;
  function step(ms: number) { for (let t = 0; t < ms; t += 50) { now += 50; game.step(.05); } }
  function stage(next: JourneyStage) {
    while (internals.story.stage !== next) {
      for (const objective of internals.story.snapshot().objectives) internals.story.credit(objective.id, objective.target);
      assert.ok(internals.story.advance(), `cannot enter ${next}`);
    }
  }
  function atStation(actor: Player, station: { x: number; z: number }) {
    let point: { x: number; z: number } | undefined;
    for (let x = -1; x <= 1 && !point; x += .25) for (let z = station.z - 1; z <= station.z + 1; z += .25) {
      const candidate = { x, z };
      if (canStand(x, z) && hasCabinSight(candidate, station) && Math.hypot(x - station.x, z - station.z) < 2.2) { point = candidate; break; }
    }
    assert.ok(point, `station ${station.x},${station.z} must have a clear approach`);
    Object.assign(actor, point);
  }
  function reject(actor: Player, type: string, payload: unknown) {
    const before = events.filter(e => e.id === actor.id && e.type === 'error').length;
    game.handle(actor.id, type, payload);
    assert.equal(events.filter(e => e.id === actor.id && e.type === 'error').length, before + 1, `${actor.role} must reject ${type}`);
  }
  return { game, events, player, step, stage, atStation, reject, internals };
}

test('every role owns three distinct checks and training can practice all roles', () => {
  assert.equal(TASKS.length, 18);
  assert.equal(new Set(TASKS.map(t => t.id)).size, 18);
  for (const role of roles) {
    assert.equal(TASKS.filter(task => task.role === role).length, 3, `${role} needs three specific duties`);
    for (const task of TASKS) {
      assert.equal(canDoTask(role, task.id, false), task.role === role);
      assert.equal(canDoTask(role, task.id, true), true);
    }
  }
  assert.equal(canDoTask('Captain', 'forged-check', false), false);
  assert.equal(canDoTask('Captain', '__proto__', true), false);
  assert.equal(canPerformDuty('Air Marshal', 'guide-passenger', false), false);
  assert.equal(canPerformDuty('Captain', 'disarm', false), false);
  assert.equal(canPerformDuty('First Officer', 'flight-control', false), false);
});

test('raw station messages cannot spoof a role, steal a challenge or bypass role checks at completion', () => {
  for (const task of TASKS) {
    const h = setup(); h.stage(task.stage);
    const owner = h.player(task.role), intruder = h.player(roles.find(role => role !== task.role)!);
    h.atStation(owner, task); h.atStation(intruder, task);
    h.reject(intruder, 'beginTask', { taskId: task.id, role: task.role, training: true });
    h.game.handle(owner.id, 'beginTask', { taskId: task.id });
    const message = h.events.at(-1)!;
    assert.equal(message.type, 'challenge', `${task.id} must be available to ${task.role}`);
    assert.equal(message.id, owner.id);
    const challenge = message.payload as TaskChallenge;
    assert.deepEqual([...challenge.sequence].sort(), [0, 1, 2, 3]);
    assert.ok(!JSON.stringify(h.game.snapshot()).includes(challenge.token));
    h.step(1250);
    h.reject(intruder, 'completeTask', { ...challenge, role: task.role, playerId: owner.id });
    assert.equal(h.game.snapshot().tasks.find(t => t.id === task.id)!.completed, false);
    owner.role = intruder.role;
    h.reject(owner, 'completeTask', challenge);
    assert.equal(h.game.snapshot().tasks.find(t => t.id === task.id)!.completed, false, 'role is checked again at completion');
    owner.role = task.role;
    h.game.handle(owner.id, 'beginTask', { taskId: task.id });
    assert.equal(h.events.at(-1)!.type, 'challenge');
    const fresh = h.events.at(-1)!.payload;
    h.step(1250); h.game.handle(owner.id, 'completeTask', fresh);
    assert.equal(h.game.snapshot().tasks.find(t => t.id === task.id)!.completedBy, owner.id);
  }
});

test('early role checks are credited in their own chapter and all training checks remain available', () => {
  for (const task of TASKS) {
    const h = setup(), owner = h.player(task.role); h.atStation(owner, task);
    h.game.handle(owner.id, 'beginTask', { taskId: task.id });
    assert.equal(h.events.at(-1)!.type, 'challenge');
    const challenge = h.events.at(-1)!.payload;
    h.step(1250); h.game.handle(owner.id, 'completeTask', challenge);
    assert.equal(h.game.snapshot().story.stage, 'departure', 'supporting checks cannot skip the journey');
    h.stage(task.stage);
    assert.equal(h.game.snapshot().story.objectives.find(o => o.id === `task:${task.id}`)!.current, 1);
    const solo = setup(true), trainee = solo.player('Captain'); solo.atStation(trainee, task);
    solo.game.handle(trainee.id, 'beginTask', { taskId: task.id });
    assert.equal(solo.events.at(-1)!.type, 'challenge', `training should allow ${task.id}`);
    assert.ok(solo.game.snapshot().story.objectives.every(o => !o.id.startsWith('task:')), 'training does not force every optional station');
  }
});

test('all public roles can fasten their own belt but only passengers can order and relax', () => {
  for (const role of roles) {
    const h = setup(), actor = h.player(role);
    Object.assign(actor, { x: 0, z: 2 });
    h.game.handle(actor.id, 'experienceAction', { phase: 'begin', kind: 'fasten-seatbelt', targetId: actor.id });
    assert.equal(h.game.snapshot().experience.actions.length, 1, `${role} can fasten their own belt`);
    h.game.handle(actor.id, 'experienceAction', { phase: 'cancel' });
    if (role === 'Passenger') {
      h.game.handle(actor.id, 'requestService', { item: 'water' });
      assert.equal(h.game.snapshot().experience.players[actor.id].order?.item, 'water');
      h.game.handle(actor.id, 'experienceAction', { phase: 'begin', kind: 'read', targetId: actor.id });
      assert.equal(h.game.snapshot().experience.actions.length, 1);
    } else {
      h.reject(actor, 'requestService', { item: 'water', role: 'Passenger' });
      h.reject(actor, 'experienceAction', { phase: 'begin', kind: 'read', targetId: actor.id, role: 'Passenger' });
      h.reject(actor, 'experienceAction', { phase: 'begin', kind: 'rest', targetId: actor.id, role: 'Passenger' });
    }
  }
});

test('only cabin crew own the safety briefing even if another role submits their private token', () => {
  const h = setup(), crew = h.player('Cabin Crew'); Object.assign(crew, SAFETY_DEMO_STATION);
  for (const role of roles.filter(role => role !== 'Cabin Crew')) {
    const actor = h.player(role); Object.assign(actor, SAFETY_DEMO_STATION);
    h.reject(actor, 'beginSafety', { role: 'Cabin Crew', training: true });
  }
  h.game.handle(crew.id, 'beginSafety', {});
  const challenge = h.events.at(-1)!.payload;
  assert.equal(h.events.at(-1)!.type, 'safetyChallenge');
  h.reject(h.player('Air Marshal'), 'submitSafety', { token: challenge.token, order: SAFETY_INSTRUCTIONS.map(card => card.id), role: 'Cabin Crew' });
  assert.equal(h.game.snapshot().safety.operatorId, crew.id);
  h.game.handle(crew.id, 'submitSafety', { token: challenge.token, order: SAFETY_INSTRUCTIONS.map(card => card.id) });
  assert.equal(h.game.snapshot().safety.status, 'demonstrating');
});

// The clients can always send these raw strings, regardless of which buttons
// their UI exposes. The game must not grant universal duties to any human.
test('raw held duties stay role scoped, including a marshal spoofing cabin guidance', () => {
  const cases = [
    ['guide-passenger', 'beginAction', { kind: 'guide-passenger', targetId: 'passenger-01' }, 'Cabin Crew'],
    ['secure-cart', 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' }, 'Cabin Crew'],
    ['secure-equipment', 'beginAction', { kind: 'secure-equipment', targetId: 'equipment-locker' }, 'Engineer'],
    ['cabin-check', 'beginAction', { kind: 'cabin-check', targetId: 'cabin-check' }, 'Cabin Crew'],
    ['repair-pressure', 'experienceAction', { phase: 'begin', kind: 'repair-pressure', targetId: 'pressure' }, 'Engineer'],
    ['extinguish-smoke', 'experienceAction', { phase: 'begin', kind: 'extinguish-smoke', targetId: 'electrical' }, 'Engineer'],
    ['aid-pilot', 'experienceAction', { phase: 'begin', kind: 'aid-pilot', targetId: 'pilot' }, 'Cabin Crew'],
    ['rescue-player', 'experienceAction', { phase: 'begin', kind: 'rescue-player', targetId: 'p0' }, 'Cabin Crew'],
    ['assist-mask', 'experienceAction', { phase: 'begin', kind: 'assist-mask', targetId: 'p0' }, 'Cabin Crew'],
    ['calm-passenger', 'experienceAction', { phase: 'begin', kind: 'calm-passenger', targetId: 'passenger-01' }, 'Cabin Crew'],
    ['disarm', 'experienceAction', { phase: 'begin', kind: 'disarm', targetId: 'p0' }, 'Air Marshal'],
  ] as const;
  for (const [duty, type, payload, owner] of cases) for (const role of roles) {
    const h = setup(), actor = h.player(role);
    assert.equal(canPerformDuty(role, duty, false), role === owner);
    if (role === owner) continue;
    h.reject(actor, type, { ...payload, role: owner, training: true });
    assert.equal(h.game.snapshot().interactions.length, 0);
    assert.equal(h.game.snapshot().experience.actions.length, 0);
  }
});

test('valid trolley, seating and cockpit interactions reject other roles at the same position', () => {
  for (const role of roles) {
    const h = setup(), actor = h.player(role); Object.assign(actor, { x: -1.25, z: 15.5 });
    h.game.handle(actor.id, 'beginAction', { kind: 'secure-cart', targetId: 'service-cart' });
    assert.equal(h.game.snapshot().interactions.length, role === 'Cabin Crew' ? 1 : 0, `${role} trolley authorization`);
    h.game.handle(actor.id, 'cancelAction', {});
    h.step(4100);
    const npc = h.game.snapshot().npcs.find(npc => npc.needsSeat)!; assert.ok(npc);
    Object.assign(actor, { x: 0, z: npc.z });
    h.game.handle(actor.id, 'beginAction', { kind: 'guide-passenger', targetId: npc.id, role: 'Cabin Crew' });
    assert.equal(h.game.snapshot().interactions.length, role === 'Cabin Crew' ? 1 : 0, `${role} seating authorization`);
    h.game.handle(actor.id, 'cancelAction', {});
    h.internals.story.beginWeatherDrill(); Object.assign(actor, { x: 0, z: -11.6 });
    h.game.handle(actor.id, 'flightControl', { roll: -.5, pitch: .5, role: 'Captain' }); h.step(50);
    assert.equal(h.game.snapshot().story.turbulence.operatorId, role === 'Captain' ? actor.id : null, `${role} flight-control authorization`);
  }
});

test('emergency repair permissions are checked at the working station and during held progress', () => {
  for (const role of roles) {
    const h = setup(), actor = h.player(role);
    const experience = (h.game as unknown as { experience: import('../server/src/systems/experience.js').ExperienceSimulation }).experience;
    experience.trigger('decompression'); experience.member(actor.id).oxygenMask = true;
    Object.assign(actor, { x: 1, z: 9.4 });
    h.game.handle(actor.id, 'experienceAction', { phase: 'begin', kind: 'repair-pressure', targetId: 'pressure', role: 'Engineer' });
    assert.equal(h.game.snapshot().experience.actions.length, role === 'Engineer' ? 1 : 0, `${role} pressure repair authorization`);
    if (role === 'Engineer') {
      actor.role = 'Passenger';
      h.game.handle(actor.id, 'experienceAction', { phase: 'maintain' }); h.step(100);
      assert.equal(h.game.snapshot().experience.actions.length, 0, 'lost permission cancels existing held work');
      assert.equal(h.game.snapshot().experience.incident, 'decompression');
    }
  }
});

test('reserve crew cover an unavailable role publicly after a grace period without unlocking human duties', () => {
  let h = setup();
  for (let tries = 0; h.game.getSecret(h.player('Cabin Crew').id).allegiance !== 'crew'; tries++) {
    assert.ok(tries < 100); h = setup();
  }
  const crew = h.player('Cabin Crew'), captain = h.player('Captain');
  h.step(21000);
  assert.equal(h.game.snapshot().tasks.some(task => task.completedBy === 'npc-crew'), false, 'an available human, including a concealed terrorist, keeps their duties');
  crew.detained = true;
  h.step(19000);
  assert.equal(h.game.snapshot().safety.status, 'idle', 'reserve crew wait through the public grace period');
  Object.assign(captain, SAFETY_DEMO_STATION); h.reject(captain, 'beginSafety', { role: 'Cabin Crew' });
  h.step(1100);
  assert.equal(h.game.snapshot().safety.status, 'complete');
  const checks = TASKS.filter(task => task.role === 'Cabin Crew' && task.stage === 'departure');
  assert.ok(checks.length > 0);
  for (const task of checks) assert.equal(h.game.snapshot().tasks.find(t => t.id === task.id)!.completedBy, 'npc-crew');
  const captainCheck = TASKS.find(task => task.role === 'Captain' && task.stage === 'departure')!;
  assert.equal(h.game.snapshot().tasks.find(t => t.id === captainCheck.id)!.completed, false);
  assert.ok(h.game.snapshot().chat.some(message => message.text.includes('NPC reserve Cabin Crew')));
  assert.equal(h.player('Captain').role, 'Captain');
  assert.equal(canPerformDuty(h.player('Captain').role, 'service', false), false);
  assert.ok(!JSON.stringify(h.game.snapshot()).includes('"allegiance":'));
});

test('having a carried item never lets a non-Cabin Crew role deliver passenger orders', () => {
  for (const role of roles) {
    const h = setup(), actor = h.player(role);
    const cabin = (h.game as unknown as { cabin: import('../server/src/systems/cabin.js').CabinSimulation }).cabin;
    const npc = cabin.get('passenger-01')!;
    npc.request = { id: 'role-order', item: 'water', remaining: 90, claimedBy: null };
    Object.assign(actor, { x: -1, z: -5.98, carriedItem: 'water' });
    h.game.handle(actor.id, 'servePassenger', { npcId: npc.id, requestId: 'role-order', role: 'Cabin Crew', training: true });
    assert.equal(h.game.snapshot().service.served, role === 'Cabin Crew' ? 1 : 0, `${role} service authorization`);
    assert.equal(actor.carriedItem, role === 'Cabin Crew' ? null : 'water');
  }
});

test('covert supply pickup keeps the public role and does not unlock normal cabin service', () => {
  let h = setup(), terrorist = h.game.snapshot().players.find(p => h.game.getSecret(p.id).allegiance === 'saboteur')!;
  for (let i = 0; terrorist.role === 'Cabin Crew'; i++) {
    assert.ok(i < 100); h = setup(); terrorist = h.game.snapshot().players.find(p => h.game.getSecret(p.id).allegiance === 'saboteur')!;
  }
  const actor = h.internals.players.get(terrorist.id)!;
  Object.assign(actor, { x: -1.4, z: 9.4 });
  h.game.handle(actor.id, 'pickUpService', { item: 'water' });
  assert.equal(actor.carriedItem, 'water', 'the covert story remains playable under a non-service public job');
  const cabin = (h.game as unknown as { cabin: import('../server/src/systems/cabin.js').CabinSimulation }).cabin;
  const npc = cabin.get('passenger-01')!;
  npc.request = { id: 'covert-order', item: 'water', remaining: 90, claimedBy: null };
  Object.assign(actor, { x: -1, z: -5.98 });
  h.reject(actor, 'servePassenger', { npcId: npc.id, requestId: 'covert-order' });
  assert.equal(actor.role, terrorist.role); assert.equal(actor.model, terrorist.model); assert.equal(actor.weaponDrawn, false);
  assert.equal(h.game.snapshot().service.served, 0);
});

test('crew can report a sole specialist who sabotages their own system without inheriting that role', () => {
  for (const [role, kind, stationId] of [['Engineer', 'blackout', 'electrical'], ['First Officer', 'comms', 'radio']] as const) {
    let h = setup();
    for (let tries = 0; h.game.getSecret(h.player(role).id).allegiance !== 'saboteur'; tries++) {
      assert.ok(tries < 100); h = setup();
    }
    const terrorist = h.player(role), captain = h.player('Captain'), station = TASKS.find(task => task.id === stationId)!;
    h.step(20100); h.game.handle(terrorist.id, 'sabotage', { kind });
    assert.equal(h.game.snapshot().sabotage, kind);
    h.atStation(captain, station); h.reject(captain, 'beginTask', { taskId: station.id, role });
    h.game.handle(captain.id, 'report', {});
    assert.equal(h.game.currentPhase, 'meeting', 'role ownership cannot suppress the vote needed to remove a hostile specialist');
    const emergency = h.game.snapshot(); h.step(3000);
    assert.equal(h.game.snapshot().sabotage, kind); assert.equal(h.game.snapshot().sabotageRemaining, emergency.sabotageRemaining);
    assert.equal(h.game.snapshot().integrity, emergency.integrity);
    for (const voter of h.game.snapshot().players) h.game.handle(voter.id, 'vote', { targetId: terrorist.id });
    assert.equal(h.game.currentPhase, 'playing'); assert.equal(h.game.snapshot().sabotage, kind, 'voting does not erase the emergency');
    h.step(19000); assert.equal(h.game.snapshot().sabotage, kind);
    h.step(1100); assert.equal(h.game.snapshot().sabotage, null); assert.equal(h.game.snapshot().winner, 'crew');
    assert.ok(h.game.snapshot().chat.some(message => message.text.includes(`NPC reserve ${role}`)));
    assert.equal(canDoTask(captain.role, station.id, false), false);
  }
});
