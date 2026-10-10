import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { FlightOperations } from '../server/src/systems/operations.js';
import { JourneySimulation } from '../server/src/systems/story.js';
import { BOARDING_DOCUMENTS, BOARDING_ENTRANCE, type Player } from '../shared/protocol.js';
import { FLIGHT_CONTROL_STATION } from '../shared/world.js';

/** Position fixtures isolate raw protocol authorization; movement and pilot
 * progression are exercised by the journey simulation/integration suites. */
function fixture() {
  let now = 0;
  const events: Array<{ id: string; type: string; payload: unknown }> = [];
  const game = new FlightGame('7310', false, (id, type, payload) => events.push({ id, type, payload }), () => now);
  const ids = Array.from({ length: 6 }, (_, i) => `adversary-${i}`);
  for (const id of ids) { game.addPlayer(id, id); game.handle(id, 'ready', { ready: true }); }
  game.handle(ids[0], 'start', {});
  const players = (game as unknown as { players: Map<string, Player> }).players;
  const captain = [...players.values()].find(player => player.role === 'Captain')!;
  const saboteur = ids.find(id => game.getSecret(id).allegiance === 'saboteur')!;
  const advance = (ms: number) => { for (let t = 0; t < ms; t += 50) { now += 50; game.step(.05); } };
  const place = (id: string, p: { x: number; z: number }) => Object.assign(players.get(id)!, p);
  const member = (id: string) => game.snapshot().operations.roster.find(entry => entry.playerId === id)!;
  const documents = (id: string) => { place(id, BOARDING_DOCUMENTS); game.handle(id, 'boardingAction', { kind: 'documents' }); };
  const board = (id: string) => { documents(id); place(id, BOARDING_ENTRANCE); game.handle(id, 'boardingAction', { kind: 'board' }); };
  return { game, ids, players, captain, saboteur, events, advance, place, member, documents, board };
}

test('journey private inventory stays isolated from public snapshots and other sessions', () => {
  const h = fixture();
  assert.equal(h.ids.filter(id => h.game.getSecret(id).allegiance === 'saboteur').length, 1);
  for (const id of h.ids) {
    assert.deepEqual(h.game.getSecret(id).inventory, id === h.saboteur ? ['knife', 'rope', 'bomb'] : []);
    assert.equal(h.players.get(id)!.equippedTool, null);
    assert.equal(h.players.get(id)!.weaponDrawn, false);
  }
  const serialized = JSON.stringify(h.game.snapshot());
  for (const privateKey of ['"inventory"', '"allegiance"', '"teammates"', '"killReadyAt"']) assert.equal(serialized.includes(privateKey), false, privateKey);
  const inventory = h.game.getSecret(h.saboteur).inventory;
  inventory.length = 0;
  assert.deepEqual(h.game.getSecret(h.saboteur).inventory, ['knife', 'rope', 'bomb'], 'returned inventory must not be mutable server storage');
  h.events.length = 0;
  const loyal = h.ids.find(id => id !== h.saboteur)!;
  h.game.handle(loyal, 'sync', { playerId: h.saboteur, allegiance: 'saboteur' });
  assert.ok(h.events.every(event => event.id === loyal), 'sync is tied to the authenticated sender');
  assert.deepEqual((h.events.find(event => event.type === 'secret')!.payload as { inventory: string[] }).inventory, []);
});

test('boarding requires own nearby documents followed by a nearby scanner', () => {
  const h = fixture(), id = h.ids[0], other = h.ids[1];
  h.place(id, { x: 8, z: 14 });
  h.game.handle(id, 'boardingAction', { kind: 'board', documentsReceived: true, boarded: true, playerId: other });
  h.game.handle(id, 'boardingAction', { kind: 'documents', playerId: other });
  assert.deepEqual(h.member(id), { playerId: id, documentsReceived: false, boarded: false });
  assert.equal(h.member(other).boarded, false);
  h.place(id, BOARDING_ENTRANCE);
  h.game.handle(id, 'boardingAction', { kind: 'board' });
  assert.equal(h.member(id).boarded, false, 'being at scanner does not forge a pass');
  h.place(id, { x: BOARDING_DOCUMENTS.x + BOARDING_DOCUMENTS.radius + .05, z: BOARDING_DOCUMENTS.z });
  h.game.handle(id, 'boardingAction', { kind: 'documents' });
  assert.equal(h.member(id).documentsReceived, false, 'document radius is authoritative');
  h.documents(id);
  assert.equal(h.member(id).documentsReceived, true);
  h.place(id, { x: BOARDING_ENTRANCE.x + BOARDING_ENTRANCE.radius + .05, z: BOARDING_ENTRANCE.z });
  h.game.handle(id, 'boardingAction', { kind: 'board' });
  assert.equal(h.member(id).boarded, false, 'scanner radius is authoritative');
  h.place(id, BOARDING_ENTRANCE);
  h.game.handle(id, 'boardingAction', { kind: 'board', playerId: other });
  assert.equal(h.member(id).boarded, true);
  assert.equal(h.member(other).boarded, false, 'sender cannot board another session');
  const position = { ...h.players.get(id)! };
  h.game.handle(id, 'boardingAction', { kind: 'board' });
  assert.deepEqual(h.players.get(id), position, 'replayed board event cannot teleport an onboard player');
});

test('clients cannot overwrite shared boarding progress, flight stage or authoritative telemetry', () => {
  const h = fixture(), before = h.game.snapshot().operations;
  const forged = { stage: 'arrived', altitude: 0, airspeed: 0, throttle: Infinity, pitch: NaN, roll: Infinity, gearDown: false, brakes: false, roster: h.ids.map(playerId => ({ playerId, documentsReceived: true, boarded: true })), landingReady: true, progress: 1, crashProgress: 1, role: 'Captain', training: true, operatorId: h.captain.id };
  for (const id of h.ids) {
    for (const type of ['aircraftControl', 'startTakeoff', 'startLanding', 'boardingAction']) {
      h.game.handle(id, type, forged);
      h.game.handle(id, type, null);
      h.game.handle(id, type, ['documents', forged]);
    }
  }
  const after = h.game.snapshot().operations;
  assert.equal(after.stage, 'boarding');
  assert.equal(after.altitude, before.altitude);
  assert.equal(after.airspeed, before.airspeed);
  assert.deepEqual(after.roster, before.roster);
  assert.equal(after.landingReady, false);
  assert.equal(h.game.snapshot().winner, null);
});

test('unboarded impostor cannot reach cabin actions through raw messages or forged actor fields', () => {
  const h = fixture();
  h.advance(20000);
  const before = h.game.snapshot();
  // Coordinates intentionally resemble a cabin location. Boarding membership,
  // not geometric coincidence or client-provided flags, must allow cabin actions.
  h.place(h.saboteur, { x: 0, z: -11.2 });
  const forged = { playerId: h.captain.id, role: 'Captain', training: true, boarded: true, allegiance: 'saboteur' };
  h.game.handle(h.saboteur, 'equipTool', { tool: 'knife', ...forged });
  h.game.handle(h.saboteur, 'drawWeapon', { drawn: true, ...forged });
  h.game.handle(h.saboteur, 'useTool', { targetId: 'pilot', ...forged });
  h.game.handle(h.saboteur, 'killNpc', { npcId: 'pilot', ...forged });
  h.game.handle(h.saboteur, 'attackPlayer', forged);
  h.game.handle(h.saboteur, 'sabotage', { kind: 'blackout', ...forged });
  h.game.handle(h.saboteur, 'oxygenCut', forged);
  h.game.handle(h.saboteur, 'experienceAction', { phase: 'begin', kind: 'poison-pilot', targetId: 'pilot', ...forged });
  const after = h.game.snapshot();
  assert.equal(after.operations.stage, 'boarding');
  assert.equal(after.operations.bomb, null);
  assert.equal(after.sabotage, null);
  assert.equal(after.experience.incident, 'none');
  assert.equal(after.experience.pilotCondition, 'healthy');
  assert.equal(after.npcs.find(npc => npc.id === 'pilot')!.alive, true);
  assert.equal(after.players.find(player => player.id === h.saboteur)!.equippedTool, null);
  assert.equal(after.integrity, before.integrity);
  assert.equal(after.winner, null);
});

test('boarding snapshot copies cannot pre-clear another player for departure', () => {
  const h = fixture(), snapshot = h.game.snapshot();
  for (const member of snapshot.operations.roster) { member.documentsReceived = true; member.boarded = true; }
  snapshot.operations.stage = 'cruise';
  snapshot.operations.restraints[h.captain.id] = 50;
  assert.ok(h.game.snapshot().operations.roster.every(member => !member.documentsReceived && !member.boarded));
  assert.equal(h.game.snapshot().operations.stage, 'boarding');
  assert.deepEqual(h.game.snapshot().operations.restraints, {});
  h.board(h.captain.id);
  h.game.handle(h.captain.id, 'startTakeoff', { allBoarded: true, training: true });
  assert.equal(h.game.snapshot().operations.stage, 'boarding', 'Captain cannot depart while somebody remains at the gate');
});

test('crew meetings pause device countdowns while physical security interactions are unavailable', () => {
  const h = fixture();
  for (const id of h.ids) h.board(id);
  h.advance(20000);
  h.place(h.saboteur, { x: 0, z: 4 });
  h.game.handle(h.saboteur, 'equipTool', { tool: 'bomb' }); h.advance(650);
  h.game.handle(h.saboteur, 'useTool', {});
  const reporter = h.ids.find(id => id !== h.saboteur)!;
  assert.ok(h.game.snapshot().operations.bomb);
  h.game.handle(reporter, 'report', {});
  assert.equal(h.game.snapshot().phase, 'meeting');
  const before = h.game.snapshot().operations;
  h.advance(10000);
  assert.deepEqual(h.game.snapshot().operations, before, 'meeting must not consume unplayable bomb/rescue time');
  for (const id of h.ids) h.game.handle(id, 'vote', { targetId: 'skip' });
  assert.equal(h.game.snapshot().phase, 'playing');
  h.advance(1000);
  assert.ok(h.game.snapshot().operations.bomb!.remaining < before.bomb!.remaining);
});

test('reserve pilots cannot begin takeoff or landing with an unresolved device', () => {
  for (const flightStage of ['boarding', 'cruise'] as const) {
    const h = fixture();
    for (const id of h.ids) h.board(id);
    const { operations, story } = h.game as unknown as { operations: FlightOperations; story: JourneySimulation };
    for (const objective of story.snapshot().objectives) story.credit(objective.id, objective.target);
    if (flightStage === 'cruise') {
      // Arrange the stage to isolate reserve dispatch from manual flight tests.
      (operations as unknown as { state: { stage: string } }).state.stage = 'cruise';
      operations.readyForLanding();
    }
    operations.plantBomb(0, 4);
    h.captain.detained = true;
    h.advance(20100);
    assert.equal(h.game.snapshot().operations.stage, flightStage, 'reserve pilot must honor the same device interlock as a human Captain');
    assert.ok(h.game.snapshot().operations.bomb);
  }
});

test('pilot controls reject role spoofing and stop authorizing restrained or detained captains', () => {
  const h = fixture();
  for (const id of h.ids) h.board(id);
  const operations = (h.game as unknown as { operations: FlightOperations }).operations;
  h.place(h.captain.id, FLIGHT_CONTROL_STATION);
  const stranger = h.ids.find(id => id !== h.captain.id)!;
  h.place(stranger, FLIGHT_CONTROL_STATION);
  operations.startTakeoff(h.captain.id);
  const input = { throttle: .8, pitch: .4, roll: .2, gearDown: true, brakes: false, role: 'Captain', operatorId: h.captain.id, training: true };
  h.game.handle(stranger, 'aircraftControl', input);
  assert.equal(h.game.snapshot().operations.throttle, 0);
  h.game.handle(h.captain.id, 'aircraftControl', input);
  assert.equal(h.game.snapshot().operations.throttle, .8);
  h.game.handle(stranger, 'aircraftControl', { release: true, playerId: h.captain.id });
  assert.equal(h.game.snapshot().operations.operatorId, h.captain.id, 'another session cannot release the Captain input');
  operations.restrain(h.captain.id);
  h.game.handle(h.captain.id, 'aircraftControl', { ...input, throttle: 1 });
  assert.equal(h.game.snapshot().operations.throttle, .8);
  h.advance(50);
  assert.equal(h.game.snapshot().operations.operatorId, null);
  operations.releaseRestraint(h.captain.id); h.captain.detained = true;
  h.game.handle(h.captain.id, 'aircraftControl', { ...input, throttle: 1 });
  assert.equal(h.game.snapshot().operations.operatorId, null);
  assert.equal(h.game.snapshot().operations.throttle, .8);
});

test('onboard attacks cannot hit unboarded players whose terminal coordinates overlap the cabin', () => {
  const h = fixture(), victim = h.ids.find(id => id !== h.saboteur)!;
  h.board(h.saboteur);
  h.advance(20000);
  h.place(h.saboteur, { x: 0, z: 4.8 });
  h.place(victim, { x: 0, z: 5.4 });
  assert.equal(h.member(victim).boarded, false);
  h.game.handle(h.saboteur, 'equipTool', { tool: 'knife' }); h.advance(650);
  h.game.handle(h.saboteur, 'useTool', { targetId: victim });
  assert.equal(h.game.snapshot().experience.players[victim].incapacitated, false, 'terminal occupants are not physically in the cabin');
  assert.equal(h.game.snapshot().operations.stage, 'boarding');
  assert.equal(h.game.snapshot().winner, null);
});
