import { randomInt, randomUUID } from 'node:crypto';
import type { Allegiance, ChatMessage, ImpostorObjective, MoveInput, Player, Role, SabotageKind, Secret, ServiceItem, Snapshot, TaskChallenge, HeldAction, WorldActionKind, SafetyChallenge, SafetyDemoState, ImpostorTool } from '../../../shared/protocol.js';
import { COLORS, SAFETY_INSTRUCTIONS, SAFETY_STEP_DURATIONS, BOARDING_DOCUMENTS, BOARDING_ENTRANCE } from '../../../shared/protocol.js';
import { canDoTask, canPerformDuty } from '../../../shared/duties.js';
import { FLIGHT_CONTROL_STATION, INTERACTION_STATIONS, IMPOSTOR_STATION, SERVICE_GALLEY, SAFETY_DEMO_STATION, hasCabinSight, movePlayer, TASKS } from '../../../shared/world.js';
import { AutopilotController, type FlightController } from './flight.js';
import { FlightOperations } from './operations.js';
import { assignRoles } from './roles.js';
import { moveTerminal } from '../../../shared/terminalMovement.js';
import { CabinSimulation, SERVICE_ITEMS } from './cabin.js';
import { ExperienceSimulation } from './experience.js';
import { JourneySimulation } from './story.js';

const ROUND_SECONDS = 720;
const RESERVE_COVERAGE_SECONDS = 20;
const PUBLIC_ROLES: Role[] = ['Captain', 'Cabin Crew', 'Engineer', 'Air Marshal', 'First Officer', 'Passenger'];
export const REPAIR_STATIONS: Record<SabotageKind, string> = { blackout: 'electrical', comms: 'radio', navigation: 'navigation' };
type Payload = Record<string, unknown>;
type Send = (id: string, type: string, payload: unknown) => void;
interface PrivatePlayer { allegiance: Allegiance; sabotageReadyAt: number; killReadyAt: number; weaponDrawnAt: number; reported: boolean; objectives: Set<ImpostorObjective['id']>; bombUsed: boolean; }
interface Challenge extends TaskChallenge { startedAt: number; sabotage: SabotageKind | null; }
function record(value: unknown): Payload { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Payload : {}; }
function cleanText(value: unknown, max: number) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''; }

/** All authoritative rules live here; public snapshots never contain private state. */
export class FlightGame {
  private players = new Map<string, Player>();
  private privatePlayers = new Map<string, PrivatePlayer>();
  private inputs = new Map<string, MoveInput & { at: number }>();
  private challenges = new Map<string, Challenge>();
  private lastChat = new Map<string, number>();
  private lastChallenge = new Map<string, number>();
  private phase: Snapshot['phase'] = 'lobby';
  private hostId = '';
  private tasks = TASKS.map(t => ({ id: t.id as string, completed: false, completedBy: '' }));
  private integrity = 100;
  private remaining = ROUND_SECONDS;
  private sabotage: SabotageKind | null = null;
  private sabotageRemaining = 0;
  private meetingRemaining = 0;
  private votes: Record<string, string> = {};
  private winner: Allegiance | null = null;
  private outcome = '';
  private chat: ChatMessage[] = [];
  private chatId = 0;
  private roundStartedAt = 0;
  private lastMeetingAt = -Infinity;
  private cabin = new CabinSimulation();
  private operations = new FlightOperations();
  private securityActions = new Map<string, { kind: 'disarmBomb' | 'releaseRestraint'; targetId: string; progress: number; lastAt: number }>();
  private captainAbsent = 0;
  private securityAbsent = 0;
  private hostileSecured = false;
  private story: JourneySimulation;
  private interactions = new Map<string, HeldAction & { lastAt: number }>();
  private standIn = 4;
  private experience: ExperienceSimulation;
  private safety: SafetyDemoState = { status: 'idle', operatorId: null, step: 0, elapsed: 0 };
  private safetyChallenge: (SafetyChallenge & { startedAt: number }) | null = null;
  private unavailableRoleSeconds = new Map<Role, number>();

  constructor(readonly roomId: string, readonly training: boolean, private send: Send, private now: () => number = Date.now, private flight: FlightController = new AutopilotController()) {
    this.story = new JourneySimulation(training);
    this.experience = new ExperienceSimulation({ training, now, playing: () => this.phase === 'playing', players: () => [...this.players.values()].filter(player => this.aboard(player.id)), cabin: this.cabin,
      canAct: id => this.aboard(id) && !!this.active(id) && !(this.safety.operatorId === id && this.safety.status === 'demonstrating'),
      saboteur: id => this.privatePlayers.get(id)?.allegiance === 'saboteur',
      covertReady: id => (this.privatePlayers.get(id)?.sabotageReadyAt ?? Infinity) <= this.now(),
      useCovert: id => { const secret = this.privatePlayers.get(id)!; secret.sabotageReadyAt = this.now() + 20000; secret.objectives.add('disrupt-system'); this.syncSecrets(); },
      error: (id, message) => this.error(id, message), announce: message => this.system(message), creditService: () => this.story.credit('serve-passenger'),
      damage: amount => { this.integrity = Math.max(0, this.integrity - amount); }, weather: () => { if (this.story.snapshot().turbulence.active) return false; this.story.beginWeatherDrill(); this.system('Weather drill: take the flight deck controls and hold the aircraft level.'); return true; },
    });
  }
  get currentPhase() { return this.phase; }
  get size() { return this.players.size; }
  private error(id: string, message: string) { this.send(id, 'error', { message }); }
  private system(text: string) { this.chat.push({ id: ++this.chatId, name: 'FLIGHT 404', text, system: true }); this.chat = this.chat.slice(-30); }
  private active(id: string) { const player = this.players.get(id); return player && !player.detained && !this.experience?.member(id)?.incapacitated && this.operations.canMove(id) ? player : undefined; }
  private aboard(id: string) { return !!this.operations.member(id)?.boarded; }
  private near(id: string, taskId: string) { const player = this.active(id), task = TASKS.find(t => t.id === taskId); return !!player && !!task && Math.hypot(player.x - task.x, player.z - task.z) < 2.25 && hasCabinSight(player, task); }

  addPlayer(id: string, name: unknown) {
    if (this.phase !== 'lobby') throw new Error('This flight has already departed.');
    if (this.players.size >= (this.training ? 1 : 10)) throw new Error('This flight is full.');
    const index = this.players.size;
    const color = COLORS.find(c => ![...this.players.values()].some(p => p.color === c)) ?? COLORS[index % COLORS.length];
    const spawnZ = Array.from({ length: 10 }, (_, slot) => 7.3 - slot * .95).find(z =>
      [...this.players.values()].every(player => Math.hypot(player.x + .35, player.z - z) > .85)
    ) ?? 7.3 - index * .95;
    this.players.set(id, { id, name: cleanText(name, 18) || `Crew ${index + 1}`, color, x: -0.35, z: spawnZ, yaw: 0, role: 'Passenger', ready: false, detained: false, model: 'passenger-a', weaponDrawn: false, equippedTool: null, carriedItem: null });
    this.experience.add(id); this.operations.add(id);
    this.privatePlayers.set(id, { allegiance: 'crew', sabotageReadyAt: 0, killReadyAt: 0, weaponDrawnAt: -Infinity, reported: false, objectives: new Set(), bombUsed: false });
    if (!this.hostId) this.hostId = id;
    this.system(`${this.players.get(id)!.name} boarded the flight.`);
  }
  removePlayer(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    if (this.safety.operatorId === id && this.safety.status !== 'complete') this.resetSafety();
    this.operations.remove(id); this.securityActions.delete(id); this.experience.remove(id); this.interactions.delete(id); this.story.stopControl(id); this.players.delete(id); this.privatePlayers.delete(id); this.inputs.delete(id); this.challenges.delete(id); this.lastChat.delete(id); this.lastChallenge.delete(id);
    delete this.votes[id];
    for (const [voter, target] of Object.entries(this.votes)) if (target === id) this.votes[voter] = 'skip';
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? '';
    this.system(`${player.name} disconnected.`);
    if (this.phase === 'playing' || this.phase === 'meeting') {
      this.checkSurvivors();
      if (this.phase === 'meeting' && this.allVoted()) this.resolveMeeting();
    }
  }
  getSecret(id: string): Secret {
    const secret = this.privatePlayers.get(id);
    return {
      inventory: secret?.allegiance === 'saboteur' ? (secret.bombUsed ? ['knife', 'rope'] : ['knife', 'rope', 'bomb']) : [],
      allegiance: secret?.allegiance ?? 'crew',
      teammates: secret?.allegiance === 'saboteur' ? [...this.privatePlayers].filter(([other, p]) => other !== id && p.allegiance === 'saboteur').map(([other]) => other) : [],
      cooldown: Math.max(0, Math.ceil(((secret?.sabotageReadyAt ?? 0) - this.now()) / 1000)),
      killCooldown: secret?.allegiance === 'saboteur' ? Math.max(0, Math.ceil((secret.killReadyAt - this.now()) / 1000)) : 0,
      objectives: secret?.allegiance === 'saboteur' ? ([
        ['disrupt-system', 'Disrupt an aircraft system'],
        ['eliminate-npc', 'Eliminate a cabin occupant'],
        ['tamper-galley', 'Falsify the service manifest'],
      ] as const).map(([id, label]) => ({ id, label, completed: secret.objectives.has(id) })) : [],
    };
  }
  sync(id: string) { this.send(id, 'snapshot', this.snapshot()); this.send(id, 'secret', this.getSecret(id)); if (this.safety.operatorId === id && this.safety.status === 'arranging') this.sendSafetyChallenge(id); }
  syncSecrets() { for (const id of this.players.keys()) this.send(id, 'secret', this.getSecret(id)); }
  snapshot(): Snapshot {
    return { roomId: this.roomId, hostId: this.hostId, training: this.training, phase: this.phase,
      players: [...this.players.values()].map(p => ({ ...p })), tasks: this.tasks.map(t => ({ ...t })),
      integrity: this.integrity, remaining: this.remaining, sabotage: this.sabotage, sabotageRemaining: this.sabotageRemaining,
      meetingRemaining: this.meetingRemaining, votes: { ...this.votes }, winner: this.winner, outcome: this.outcome,
      operations: this.operations.snapshot(), flight: { ...this.flight.snapshot(), mode: this.operations.stage === 'takeoff' || this.operations.stage === 'landing' ? 'manual' : 'autopilot', altitude: this.operations.snapshot().altitude, airspeed: this.operations.snapshot().airspeed }, chat: this.chat.map(m => ({ ...m })), npcs: this.cabin.snapshot(), service: this.cabin.serviceSnapshot(), story: this.story.snapshot(), experience: this.experience.snapshot(), safety: { ...this.safety }, interactions: [...this.interactions.values()].map(({ lastAt: _, ...action }) => ({ ...action })) };
  }
  handle(id: string, type: string, raw: unknown) {
    if (!this.players.has(id)) return;
    const data = record(raw);
    const permittedBeforeBoarding = ['sync', 'ready', 'start', 'move', 'chat', 'restart', 'boardingAction', 'vote'];
    if (this.phase === 'playing' && !this.aboard(id) && !permittedBeforeBoarding.includes(type)) { this.error(id, 'Collect your documents and board at the gate first.'); return; }
    const flightOnly = ['sync', 'chat', 'aircraftControl', 'restart'];
    if (this.phase === 'playing' && ['takeoff', 'landing'].includes(this.operations.stage) && !flightOnly.includes(type)) { if (type !== 'move') this.error(id, 'Remain seated during takeoff and landing.'); return; }
    // The shared demonstration is a timed performance, not a client completion
    // flag. Keep the presenter free of conflicting actions until it finishes.
    if (this.safety.status === 'demonstrating' && this.safety.operatorId === id && !['sync', 'chat', 'report', 'vote', 'restart'].includes(type)) {
      if (!['move', 'maintainAction', 'cancelAction'].includes(type)) this.error(id, 'Finish the safety demonstration before starting another action.');
      return;
    }
    switch (type) {
      case 'boardingAction': this.boardingAction(id, data.kind); break;
      case 'startTakeoff': this.startTakeoff(id); break;
      case 'startLanding': this.startLanding(id); break;
      case 'aircraftControl': this.aircraftControl(id, data); break;
      case 'equipTool': this.equipTool(id, data.tool); break;
      case 'useTool': this.useTool(id, data.targetId); break;
      case 'oxygenCut': this.oxygenCut(id); break;
      case 'disarmBomb': case 'releaseRestraint': this.securityAction(id, type, data); break;
      case 'sync': this.sync(id); break;
      case 'ready': if (this.phase === 'lobby') { const player = this.players.get(id)!; player.ready = typeof data.ready === 'boolean' ? data.ready : !player.ready; } break;
      case 'start': this.start(id); break;
      case 'move': this.move(id, data); break;
      case 'beginTask': this.beginTask(id, data.taskId); break;
      case 'completeTask': this.completeTask(id, data); break;
      case 'sabotage': this.triggerSabotage(id, data.kind); break;
      case 'repair': if (this.sabotage) this.beginTask(id, REPAIR_STATIONS[this.sabotage]); else this.error(id, 'There is no active emergency.'); break;
      case 'report': this.report(id); break;
      case 'vote': this.vote(id, data.targetId); break;
      case 'chat': this.addChat(id, data.text); break;
      case 'restart': this.restart(id); break;
      case 'pickUpService': this.pickUpService(id, data.item); break;
      case 'servePassenger': this.servePassenger(id, data); break;
      case 'killNpc': this.killNpc(id, data.npcId); break;
      case 'impostorTask': this.impostorTask(id, data.taskId); break;
      case 'beginAction': this.beginAction(id, data); break;
      case 'maintainAction': if (this.interactions.has(id)) this.interactions.get(id)!.lastAt = this.now(); break;
      case 'cancelAction': this.interactions.delete(id); break;
      case 'flightControl': this.flightControl(id, data); break;
      case 'drawWeapon': this.drawWeapon(id, data.drawn); break;
      case 'beginSafety': this.beginSafety(id); break;
      case 'submitSafety': this.submitSafety(id, data); break;
      case 'requestService': this.experience.request(id, data.item); break;
      case 'servePlayer': this.experience.serve(id, data); break;
      case 'attackPlayer': this.attackPlayer(id, data.playerId); break;
      case 'experienceAction':
        if (data.phase === 'begin') { this.interactions.delete(id); this.challenges.delete(id); this.story.stopControl(id); }
        this.experience.action(id, data); break;
      case 'incidentDrill': this.experience.drill(id, data.kind); break;
      case 'cancelSafety': if (this.safety.operatorId === id && this.safety.status === 'arranging') this.resetSafety(); break;
    }
  }
  private start(id: string) {
    if (id !== this.hostId || this.phase !== 'lobby') return this.error(id, 'Only the host can start from the lobby.');
    if (this.players.size < (this.training ? 1 : 3)) return this.error(id, 'At least 3 players are needed. Use training to explore solo.');
    if ([...this.players.values()].some(p => !p.ready)) return this.error(id, 'Every player must be ready before departure.');
    this.experience.reset([...this.players.keys()]);
    this.operations.reset([...this.players.keys()]); this.securityActions.clear(); this.captainAbsent = 0; this.securityAbsent = 0; this.hostileSecured = false;
    this.phase = 'playing'; this.roundStartedAt = this.now(); this.lastMeetingAt = this.now(); this.flight.reset(); this.cabin.reset(); this.resetSafety(); this.interactions.clear(); this.unavailableRoleSeconds.clear(); this.standIn = 4;
    for (const [playerId, assignment] of assignRoles([...this.players.keys()], this.training)) {
      this.players.get(playerId)!.role = assignment.role;
      this.players.get(playerId)!.model = 'passenger-a';
      Object.assign(this.players.get(playerId)!, { x: ([...this.players.keys()].indexOf(playerId) % 5 - 2) * 1.2, z: 11 + Math.floor([...this.players.keys()].indexOf(playerId) / 5) * 1.1, yaw: 0, equippedTool: null });
      this.players.get(playerId)!.weaponDrawn = false;
      this.players.get(playerId)!.carriedItem = null;
      this.privatePlayers.set(playerId, { allegiance: assignment.allegiance, sabotageReadyAt: this.now() + 15000, killReadyAt: this.now() + 10000, weaponDrawnAt: -Infinity, reported: false, objectives: new Set(), bombUsed: false });
    }
    this.story.reset([...this.players.values()].map(player => player.role));
    this.system(this.training ? 'Training started. Complete each chapter of the journey. You can perform every crew duty.' : 'Boarding is open. Collect your documents, scan at the gate, then complete departure duties. Exactly one player has a hidden Terrorist allegiance.');
    this.system(this.story.snapshot().instruction);
    this.syncSecrets();
  }
  private boardingAction(id: string, kind: unknown) {
    const player = this.active(id);
    if (this.phase !== 'playing' || this.operations.stage !== 'boarding' || !player || this.aboard(id)) return this.error(id, 'Boarding is not available now.');
    const station = kind === 'documents' ? BOARDING_DOCUMENTS : kind === 'board' ? BOARDING_ENTRANCE : null;
    if (!station || Math.hypot(player.x - station.x, player.z - station.z) >= station.radius) return this.error(id, 'Walk to the document desk or boarding scanner first.');
    if (kind === 'documents') { this.operations.documents(id); return; }
    if (!this.operations.board(id)) return this.error(id, 'Collect your documents at the desk before boarding.');
    const index = [...this.players.keys()].indexOf(id);
    Object.assign(player, { x: -.35, z: 7.3 - index * .95, yaw: 0 }); this.inputs.delete(id);
    this.system(`${player.name} boarded with their ${player.role === 'Passenger' ? 'boarding pass' : 'crew documents'}.`);
  }
  private startTakeoff(id: string) {
    if (this.operations.stage !== 'boarding' || !this.atFlightControls(id) || !this.aboard(id)) return this.error(id, 'The Captain starts takeoff at the flight deck controls.');
    if (!this.operations.allBoarded([...this.players.values()])) return this.error(id, 'Wait for every active player to board.');
    if (!this.story.ready || !this.cabin.allSeated() || this.experience.unresolved || this.sabotage || this.operations.snapshot().bomb) return this.error(id, 'Complete departure checks and resolve cabin alerts before takeoff.');
    this.operations.startTakeoff(id); this.inputs.clear(); this.experience.cancel(); this.interactions.clear(); this.challenges.clear(); this.securityActions.clear();
    this.system('Takeoff clearance. Release brakes, advance throttle, then rotate above 135 knots. Retract gear after liftoff and climb to 600 feet.');
  }
  private startLanding(id: string) {
    if (!this.atFlightControls(id) || !this.aboard(id) || this.experience.unresolved || this.sabotage || this.operations.snapshot().bomb || !this.operations.startLanding(id)) return this.error(id, 'The Captain begins landing after arrival checks and cabin alerts are clear.');
    this.inputs.clear(); this.experience.cancel(); this.interactions.clear(); this.challenges.clear(); this.securityActions.clear();
    this.system('Landing clearance. Lower gear, hold 110–150 knots and keep the aircraft level. After touchdown set idle throttle and hold brakes.');
  }
  private aircraftControl(id: string, data: Payload) {
    if (data.release === true) { this.operations.releaseControl(id); return; }
    if (!this.atFlightControls(id) || !this.aboard(id) || !this.operations.control(id, this.now(), data)) return this.error(id, 'Only the active Captain at the controls can fly takeoff and landing.');
  }
  private equipTool(id: string, tool: unknown) {
    const player = this.active(id), secret = this.privatePlayers.get(id);
    if (this.phase !== 'playing' || !player || !this.aboard(id) || secret?.allegiance !== 'saboteur') return this.error(id, 'Only the active hidden Terrorist has this private inventory.');
    if (tool !== null && tool !== 'knife' && tool !== 'rope' && tool !== 'bomb') return this.error(id, 'Choose an inventory item.');
    if (tool === 'bomb' && secret.bombUsed) return this.error(id, 'Your single device has already been used.');
    if (player.equippedTool === tool) return;
    if (player.equippedTool && this.now() - secret.weaponDrawnAt < 600) return this.error(id, 'Finish drawing before changing or concealing your tool.');
    player.equippedTool = tool as ImpostorTool | null; player.weaponDrawn = tool !== null;
    if (tool) { secret.weaponDrawnAt = this.now(); this.experience.cancel(id); this.interactions.delete(id); this.securityActions.delete(id); this.story.stopControl(id); player.carriedItem = null; if (this.safety.operatorId === id && this.safety.status === 'arranging') this.resetSafety(); }
  }
  private useTool(id: string, targetId: unknown) {
    const player = this.active(id), secret = this.privatePlayers.get(id);
    if (this.phase !== 'playing' || !player || !this.aboard(id) || secret?.allegiance !== 'saboteur' || !player.equippedTool || !player.weaponDrawn) return this.error(id, 'Equip a tool from your private inventory first.');
    if (this.now() - secret.weaponDrawnAt < 600) return this.error(id, 'Finish drawing the tool before using it.');
    if (player.equippedTool === 'knife') { if (typeof targetId === 'string' && this.players.has(targetId)) this.attackPlayer(id, targetId); else this.killNpc(id, targetId); return; }
    if (player.equippedTool === 'bomb') {
      if (secret.bombUsed || this.operations.snapshot().bomb || secret.sabotageReadyAt > this.now()) return this.error(id, 'The device is unavailable or sabotage is recharging.');
      if (player.z < -9 || player.z > 9) return this.error(id, 'Place the device inside the passenger cabin.');
      if (!this.operations.plantBomb(player.x, player.z)) return;
      secret.bombUsed = true; secret.sabotageReadyAt = this.now() + 25000; secret.objectives.add('disrupt-system'); player.equippedTool = null; player.weaponDrawn = false;
      this.system('DEVICE ALERT. A device was spotted in the cabin. The Engineer or Air Marshal must hold to disarm it within 60 seconds.'); this.syncSecrets(); return;
    }
    const target = typeof targetId === 'string' ? this.active(targetId) : undefined;
    if (!target || target.id === id || !this.aboard(target.id) || Math.hypot(player.x - target.x, player.z - target.z) >= 1.8 || !hasCabinSight(player, target)) return this.error(id, 'Move close to an active player with a clear view.');
    if (secret.killReadyAt > this.now()) return this.error(id, 'Your restraint ability is recharging.');
    this.operations.restrain(target.id); this.inputs.delete(target.id); this.interactions.delete(target.id); this.challenges.delete(target.id); this.experience.cancel(target.id); this.story.stopControl(target.id);
    target.weaponDrawn = false; target.equippedTool = null; target.carriedItem = null; secret.killReadyAt = this.now() + 25000;
    this.system(`${target.name} is restrained. Cabin Crew or an Air Marshal can free them, or they can wait 20 seconds.`); this.syncSecrets();
  }
  private oxygenCut(id: string) {
    const player = this.active(id), secret = this.privatePlayers.get(id);
    if (this.phase !== 'playing' || !player || !this.aboard(id) || secret?.allegiance !== 'saboteur' || secret.sabotageReadyAt > this.now()) return this.error(id, 'Oxygen sabotage is unavailable or recharging.');
    if (!this.experience.trigger('decompression')) return this.error(id, 'Resolve the current cabin incident before starting another.');
    secret.sabotageReadyAt = this.now() + 25000; secret.objectives.add('disrupt-system'); this.syncSecrets();
  }
  private validSecurityAction(id: string, kind: 'disarmBomb' | 'releaseRestraint', targetId: string) {
    const player = this.active(id); if (this.phase !== 'playing' || !player || !this.aboard(id) || player.weaponDrawn) return false;
    if (kind === 'disarmBomb') { const bomb = this.operations.snapshot().bomb; return !!bomb && (this.training || player.role === 'Engineer' || player.role === 'Air Marshal') && Math.hypot(player.x - bomb.x, player.z - bomb.z) < 2 && hasCabinSight(player, bomb); }
    const target = this.players.get(targetId); return !!target && targetId !== id && this.aboard(targetId) && !!this.operations.snapshot().restraints[targetId] && (this.training || player.role === 'Cabin Crew' || player.role === 'Air Marshal') && Math.hypot(player.x - target.x, player.z - target.z) < 2 && hasCabinSight(player, target);
  }
  private securityAction(id: string, kind: 'disarmBomb' | 'releaseRestraint', data: Payload) {
    if (data.phase === 'cancel') { this.securityActions.delete(id); return; }
    if (data.phase === 'maintain') { const action = this.securityActions.get(id); if (action?.kind === kind) action.lastAt = this.now(); return; }
    const targetId = typeof data.targetId === 'string' ? data.targetId : '';
    if (data.phase !== 'begin' || !this.validSecurityAction(id, kind, targetId)) return this.error(id, 'Move closer and use the security action assigned to your role.');
    this.experience.cancel(id); this.interactions.delete(id); this.challenges.delete(id); this.story.stopControl(id);
    if (!this.securityActions.has(id)) this.securityActions.set(id, { kind, targetId, progress: 0, lastAt: this.now() });
  }
  private stepSecurityActions(dt: number) {
    let bombWorked = false;
    for (const [id, action] of this.securityActions) {
      if (this.now() - action.lastAt > 500 || !this.validSecurityAction(id, action.kind, action.targetId)) { this.securityActions.delete(id); continue; }
      if (action.kind === 'disarmBomb') { if (bombWorked) continue; bombWorked = true; if (this.operations.disarm(dt / 6)) { this.system('The device has been disarmed. The cabin is secure.'); this.securityActions.delete(id); } }
      else { action.progress += dt; if (action.progress + 1e-6 >= 3) { this.operations.releaseRestraint(action.targetId); this.securityActions.delete(id); this.system('The restrained passenger has been freed.'); } }
    }
  }
  private crash(reason: string) { this.operations.crash(reason); this.end('saboteur', reason); }
  private move(id: string, data: Payload) {
    if ((this.phase !== 'playing' && this.phase !== 'lobby') || !this.active(id)) return;
    if (typeof data.dx !== 'number' || typeof data.dz !== 'number' || typeof data.yaw !== 'number' || !Number.isFinite(data.dx) || !Number.isFinite(data.dz) || !Number.isFinite(data.yaw)) return;
    if (Math.hypot(data.dx, data.dz) > .001) this.experience.moving(id);
    const length = Math.max(1, Math.hypot(data.dx, data.dz));
    this.inputs.set(id, { dx: data.dx / length, dz: data.dz / length, yaw: ((data.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), at: this.now() });
  }
  private resetSafety() {
    this.safety = { status: 'idle', operatorId: null, step: 0, elapsed: 0 };
    this.safetyChallenge = null;
  }
  private atSafetyStation(id: string) {
    const player = this.active(id), station = SAFETY_DEMO_STATION;
    return !!player && !player.weaponDrawn && canPerformDuty(player.role, 'safety-demo', this.training) && Math.hypot(player.x - station.x, player.z - station.z) < station.radius && hasCabinSight(player, station);
  }
  private sendSafetyChallenge(id: string) {
    if (this.safetyChallenge) this.send(id, 'safetyChallenge', { token: this.safetyChallenge.token, cards: [...this.safetyChallenge.cards] } satisfies SafetyChallenge);
  }
  private beginSafety(id: string) {
    if (this.phase !== 'playing' || !this.story.needed('safety-demo')) return this.error(id, 'The safety demonstration is a departure duty.');
    const player = this.active(id);
    if (!player || !canPerformDuty(player.role, 'safety-demo', this.training)) return this.error(id, 'Cabin Crew present the safety demonstration. Follow your assigned duties.');
    if (!this.atSafetyStation(id)) return this.error(id, 'Move to the front safety station with your weapon concealed.');
    if (this.safety.status === 'arranging' && this.safety.operatorId === id) { this.sendSafetyChallenge(id); return; }
    if (this.safety.status !== 'idle') return this.error(id, 'Another crew member is preparing the safety demonstration.');
    const cards = SAFETY_INSTRUCTIONS.map(instruction => instruction.id);
    for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    // Every attempt opens with a puzzle that actually needs arranging.
    if (cards.every((card, index) => card === SAFETY_INSTRUCTIONS[index].id)) cards.push(cards.shift()!);
    this.safetyChallenge = { token: randomUUID(), cards, startedAt: this.now() };
    this.safety = { status: 'arranging', operatorId: id, step: 0, elapsed: 0 };
    this.interactions.delete(id); this.challenges.delete(id); this.story.stopControl(id);
    this.sendSafetyChallenge(id);
  }
  private submitSafety(id: string, data: Payload) {
    const challenge = this.safetyChallenge;
    if (this.phase !== 'playing' || this.safety.status !== 'arranging' || this.safety.operatorId !== id || !challenge || data.token !== challenge.token) return this.error(id, 'This safety briefing session expired. Open the front station again.');
    if (this.now() - challenge.startedAt >= 60000 || !this.atSafetyStation(id) || !this.story.needed('safety-demo')) { this.resetSafety(); return this.error(id, 'Stay near the front station and arrange the cards within one minute.'); }
    if (!Array.isArray(data.order) || data.order.length !== SAFETY_INSTRUCTIONS.length || new Set(data.order).size !== SAFETY_INSTRUCTIONS.length || !data.order.every(card => SAFETY_INSTRUCTIONS.some(instruction => instruction.id === card))) return this.error(id, 'Place each of the four instruction cards in a different box.');
    if (!data.order.every((card, index) => card === SAFETY_INSTRUCTIONS[index].id)) return this.error(id, 'Try again: seatbelt, oxygen mask, life vest, then exits.');
    const player = this.players.get(id)!;
    Object.assign(player, { x: SAFETY_DEMO_STATION.x, z: SAFETY_DEMO_STATION.z, yaw: Math.PI, carriedItem: null });
    this.inputs.delete(id); this.interactions.delete(id); this.challenges.delete(id); this.safetyChallenge = null;
    this.safety = { status: 'demonstrating', operatorId: id, step: 0, elapsed: 0 };
    this.system(`${player.name} is presenting the cabin safety demonstration.`);
  }
  private stepSafety(dt: number) {
    const { status, operatorId } = this.safety;
    if (status === 'idle' || status === 'complete' || !operatorId) return;
    if (!this.atSafetyStation(operatorId) || !this.story.needed('safety-demo')) { this.resetSafety(); return; }
    if (status === 'arranging') {
      if (!this.safetyChallenge || this.now() - this.safetyChallenge.startedAt >= 60000) this.resetSafety();
      return;
    }
    this.safety.elapsed += dt;
    const duration = SAFETY_STEP_DURATIONS[this.safety.step];
    if (this.safety.elapsed + 1e-6 < duration) return;
    if (this.safety.step < SAFETY_INSTRUCTIONS.length - 1) { this.safety.step++; this.safety.elapsed = 0; return; }
    this.safety.elapsed = duration; this.safety.status = 'complete';
    this.story.credit('safety-demo');
    this.system('The safety demonstration is complete. Thank you for your attention.');
  }
  private beginTask(id: string, taskId: unknown) {
    if (this.phase !== 'playing' || !this.active(id)) return this.error(id, 'Tasks are available to active crew during flight.');
    if (typeof taskId !== 'string' || !this.near(id, taskId)) return this.error(id, 'Move closer to the station to interact.');
    const player = this.active(id)!;
    if (player.weaponDrawn || !canDoTask(player.role, taskId, this.training)) return this.error(id, `This check is assigned to ${TASKS.find(t => t.id === taskId)!.role}. Follow your own duty list.`);
    const task = this.tasks.find(t => t.id === taskId)!;
    const isRepair = this.sabotage !== null && REPAIR_STATIONS[this.sabotage] === taskId;
    if (task.completed && !isRepair) return this.error(id, 'This station is already complete.');
    if (this.now() - (this.lastChallenge.get(id) ?? -Infinity) < 500) return;
    this.lastChallenge.set(id, this.now());
    // Cover every equipment item once, in a server-selected check order.
    const sequence = [0, 1, 2, 3];
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = randomInt(i + 1); [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
    const challenge: Challenge = { taskId, token: randomUUID(), sequence, startedAt: this.now(), sabotage: isRepair ? this.sabotage : null };
    this.challenges.set(id, challenge);
    this.send(id, 'challenge', { taskId, token: challenge.token, sequence: [...challenge.sequence] } satisfies TaskChallenge);
  }
  private completeTask(id: string, data: Payload) {
    if (this.phase !== 'playing' || !this.active(id)) return;
    const challenge = this.challenges.get(id);
    if (!challenge || data.token !== challenge.token || data.taskId !== challenge.taskId) return this.error(id, 'The station session expired. Open it again.');
    const operator = this.active(id)!;
    if (operator.weaponDrawn || !canDoTask(operator.role, challenge.taskId, this.training)) { this.challenges.delete(id); return this.error(id, 'Your current role cannot complete this check.'); }
    if (!this.near(id, challenge.taskId)) return this.error(id, 'Stay near the station while working.');
    const elapsed = this.now() - challenge.startedAt;
    if (elapsed < 1200) return this.error(id, 'Follow the sequence before confirming.');
    if (elapsed > 90000) { this.challenges.delete(id); return this.error(id, 'The station session expired. Open it again.'); }
    if (!Array.isArray(data.sequence) || data.sequence.length !== 4 || !data.sequence.every((n, i) => n === challenge.sequence[i])) return this.error(id, 'Incorrect sequence. Follow the lights in order.');
    this.challenges.delete(id);
    const player = this.players.get(id)!;
    if (challenge.sabotage) {
      if (this.sabotage !== challenge.sabotage) return this.error(id, 'This emergency has already been resolved.');
      this.system(`${player.name} restored ${challenge.sabotage === 'blackout' ? 'cabin power' : challenge.sabotage === 'comms' ? 'communications' : 'navigation'}.`);
      this.sabotage = null; this.sabotageRemaining = 0; this.integrity = Math.min(100, this.integrity + 8);
    }
    const task = this.tasks.find(t => t.id === challenge.taskId)!;
    if (!task.completed) { task.completed = true; task.completedBy = id; this.system(`${player.name} completed ${TASKS.find(t => t.id === task.id)!.name.toLowerCase()}.`); }
    this.story.completeTask(task.id);
  }
  private triggerSabotage(id: string, kind: unknown) {
    const secret = this.privatePlayers.get(id)!;
    if (this.phase !== 'playing' || !this.active(id) || secret.allegiance !== 'saboteur') return this.error(id, 'Only the active Terrorist can disrupt this flight.');
    if (kind !== 'blackout' && kind !== 'comms' && kind !== 'navigation') return this.error(id, 'Unknown disruption.');
    if (this.sabotage) return this.error(id, 'An emergency is already active.');
    if (secret.sabotageReadyAt > this.now()) return this.error(id, 'Your disruption is recharging.');
    this.sabotage = kind; this.sabotageRemaining = 55; secret.sabotageReadyAt = this.now() + 35000;
    secret.objectives.add('disrupt-system');
    this.system(`${kind === 'blackout' ? 'POWER FAILURE' : kind === 'comms' ? 'COMMS OFFLINE' : 'ROUTE FAULT'}: restore the ${TASKS.find(t => t.id === REPAIR_STATIONS[kind])!.area.toLowerCase()} station within 55 seconds.`);
    this.syncSecrets();
  }
  private pickUpService(id: string, item: unknown) {
    const player = this.active(id);
    if (this.phase !== 'playing' || !player) return this.error(id, 'Cabin service is available to active crew during flight.');
    if (!canPerformDuty(player.role, 'service', this.training) && this.privatePlayers.get(id)?.allegiance !== 'saboteur') return this.error(id, 'Cabin Crew collect supplies for passenger service.');
    if (typeof item !== 'string' || !SERVICE_ITEMS.includes(item as ServiceItem)) return this.error(id, 'Choose water, coffee, a meal or a blanket.');
    if (Math.hypot(player.x - SERVICE_GALLEY.x, player.z - SERVICE_GALLEY.z) >= 2.25) return this.error(id, 'Collect service supplies from the aft galley.');
    if (player.weaponDrawn && this.now() - this.privatePlayers.get(id)!.weaponDrawnAt < 600) return this.error(id, 'Wait before concealing your weapon to collect supplies.');
    // Choosing a new item at the galley replaces the held item; no remote inventory writes.
    player.weaponDrawn = false; player.carriedItem = item as ServiceItem;
  }
  private servePassenger(id: string, data: Payload) {
    const player = this.active(id);
    if (this.phase !== 'playing' || !player) return this.error(id, 'Cabin service is available to active crew during flight.');
    if (player.weaponDrawn || !canPerformDuty(player.role, 'service', this.training)) return this.error(id, 'Cabin Crew deliver passenger orders.');
    if (typeof data.npcId !== 'string' || typeof data.requestId !== 'string') return this.error(id, 'Choose a current passenger request.');
    const npc = this.cabin.get(data.npcId);
    if (!npc?.alive || npc.kind !== 'passenger' || npc.request?.id !== data.requestId) return this.error(id, 'This passenger request is no longer active.');
    if (Math.hypot(player.x - npc.x, player.z - npc.z) >= 2.4 || !hasCabinSight(player, npc)) return this.error(id, 'Move closer to the passenger with a clear view to deliver their request.');
    if (!player.carriedItem || !this.cabin.serve(data.npcId, data.requestId, player.carriedItem)) return this.error(id, 'Bring the requested item from the aft galley.');
    player.carriedItem = null; this.story.credit('serve-passenger');
  }
  private killNpc(id: string, npcId: unknown) {
    const player = this.active(id), secret = this.privatePlayers.get(id)!;
    if (this.phase !== 'playing' || !player || secret.allegiance !== 'saboteur') return this.error(id, 'Only the active Terrorist can eliminate an occupant.');
    if (!player.weaponDrawn || player.equippedTool !== 'knife') return this.error(id, 'Draw your knife before attempting an elimination. Nearby crew can see it.');
    if (this.now() - secret.weaponDrawnAt < 600) return this.error(id, 'Raise the weapon fully before using it.');
    if (typeof npcId !== 'string') return this.error(id, 'Choose a living cabin occupant.');
    const npc = this.cabin.get(npcId);
    if (!npc?.alive) return this.error(id, 'This occupant is no longer available.');
    if (secret.killReadyAt > this.now()) return this.error(id, 'Your elimination ability is recharging.');
    if (Math.hypot(player.x - npc.x, player.z - npc.z) >= 1.8 || !hasCabinSight(player, npc)) return this.error(id, 'Move closer to the occupant with a clear view.');
    if (!this.cabin.kill(npcId)) return this.error(id, 'This occupant is no longer available.');
    secret.killReadyAt = this.now() + 25000; secret.objectives.add('eliminate-npc');
    if (npc.kind === 'pilot') { this.crash('The pilot was attacked. FLIGHT 404 went down over the ocean.'); this.syncSecrets(); return; }
    this.integrity = Math.max(0, this.integrity - 10);
    this.system('A cabin occupant is unresponsive. Report the incident to the crew.');
    this.syncSecrets();
    if (!this.integrity) this.end('saboteur', 'The flight could no longer remain secure. The Terrorist won.');
  }
  private attackPlayer(id: string, targetId: unknown) {
    const player = this.active(id), secret = this.privatePlayers.get(id)!;
    const target = typeof targetId === 'string' ? this.active(targetId) : undefined;
    if (this.phase !== 'playing' || !player || secret.allegiance !== 'saboteur' || !target || !this.aboard(target.id) || target.id === id) return this.error(id, 'Choose an active nearby crew member.');
    if (!player.weaponDrawn || player.equippedTool !== 'knife' || this.now() - secret.weaponDrawnAt < 600) return this.error(id, 'Expose your weapon before acting. Nearby crew can intervene.');
    if (secret.killReadyAt > this.now()) return this.error(id, 'Your attack is recharging.');
    if (Math.hypot(player.x - target.x, player.z - target.z) >= 1.8 || !hasCabinSight(player, target)) return this.error(id, 'Move close with a clear view of the target.');
    if (!this.experience.incapacitate(target.id)) return;
    if (target.role === 'Captain') { secret.killReadyAt = this.now() + 25000; this.crash('The Captain was attacked. FLIGHT 404 went down over the ocean.'); this.syncSecrets(); return; }
    this.inputs.delete(target.id); this.interactions.delete(target.id); this.challenges.delete(target.id); this.story.stopControl(target.id);
    if (this.safety.operatorId === target.id && this.safety.status !== 'complete') this.resetSafety();
    secret.killReadyAt = this.now() + 25000; secret.objectives.add('eliminate-npc');
    this.integrity = Math.max(0, this.integrity - 8); this.system(`${target.name} needs assistance. Cabin Crew can help them recover.`); this.syncSecrets();
  }
  private impostorTask(id: string, taskId: unknown) {
    const player = this.active(id), secret = this.privatePlayers.get(id)!;
    if (this.phase !== 'playing' || !player || secret.allegiance !== 'saboteur') return this.error(id, 'Only the active Terrorist can alter the service manifest.');
    if (taskId !== IMPOSTOR_STATION.id) return this.error(id, 'Unknown covert assignment.');
    if (secret.objectives.has('tamper-galley')) return this.error(id, 'The service manifest has already been falsified.');
    if (Math.hypot(player.x - IMPOSTOR_STATION.x, player.z - IMPOSTOR_STATION.z) >= 2.25) return this.error(id, 'Reach the aft galley service manifest first.');
    secret.objectives.add('tamper-galley'); this.integrity = Math.max(0, this.integrity - 8);
    this.syncSecrets();
    if (!this.integrity) this.end('saboteur', 'The flight could no longer remain secure. The Terrorist won.');
  }
  private drawWeapon(id: string, drawn: unknown) { if (typeof drawn === 'boolean') this.equipTool(id, drawn ? 'knife' : null); }
  private actionTarget(kind: WorldActionKind, targetId: string) {
    if (kind === 'guide-passenger') {
      const npc = this.cabin.get(targetId);
      return npc?.alive && npc.needsSeat ? { x: npc.x, z: npc.z, duration: 2.5, radius: 2.2 } : null;
    }
    const station = INTERACTION_STATIONS.find(s => s.kind === kind && s.id === targetId);
    return station ? { ...station, radius: 2.25 } : null;
  }
  private validAction(id: string, kind: WorldActionKind, targetId: string) {
    const player = this.active(id), target = this.actionTarget(kind, targetId);
    if (this.phase !== 'playing' || !player || player.weaponDrawn || !canPerformDuty(player.role, kind, this.training) || !target || !this.story.allows(kind)) return false;
    if (kind === 'cabin-check' && !this.cabin.allSeated()) return false;
    return Math.hypot(player.x - target.x, player.z - target.z) < target.radius && hasCabinSight(player, target);
  }
  private beginAction(id: string, data: Payload) {
    if (typeof data.kind !== 'string' || typeof data.targetId !== 'string') return this.error(id, 'Choose a nearby crew duty.');
    const kind = data.kind as WorldActionKind;
    this.experience.cancel(id);
    if (!this.validAction(id, kind, data.targetId)) return this.error(id, 'Move closer to the active duty and keep passengers seated for the final check.');
    if (this.interactions.has(id)) return;
    this.story.stopControl(id);
    const target = this.actionTarget(kind, data.targetId)!;
    this.interactions.set(id, { playerId: id, kind, targetId: data.targetId, progress: 0, duration: target.duration, lastAt: this.now() });
  }
  private stepActions(dt: number) {
    for (const [id, action] of this.interactions) {
      if (this.now() - action.lastAt > 500 || !this.validAction(id, action.kind, action.targetId)) { this.interactions.delete(id); continue; }
      action.progress = Math.min(action.duration, action.progress + dt);
      if (action.progress + 1e-6 < action.duration) continue;
      this.interactions.delete(id);
      if (action.kind === 'guide-passenger' && !this.cabin.guideToSeat(action.targetId)) continue;
      this.story.credit(action.kind);
    }
  }
  private atFlightControls(id: string) {
    const player = this.active(id), station = FLIGHT_CONTROL_STATION;
    return this.phase === 'playing' && !!player && !player.weaponDrawn && canPerformDuty(player.role, 'flight-control', this.training) && Math.hypot(player.x - station.x, player.z - station.z) < station.radius && hasCabinSight(player, station);
  }
  private flightControl(id: string, data: Payload) {
    if (data.release === true) { this.story.stopControl(id); return; }
    if (!this.atFlightControls(id) || !this.story.snapshot().turbulence.active) return;
    if (typeof data.roll !== 'number' || typeof data.pitch !== 'number' || !Number.isFinite(data.roll) || !Number.isFinite(data.pitch)) return;
    this.experience.cancel(id); this.interactions.delete(id); this.story.setControl(id, data.roll, data.pitch, this.now());
  }
  private report(id: string) {
    if (this.phase !== 'playing' || !this.active(id)) return;
    if (this.training) return this.error(id, 'Crew meetings are available in multiplayer flights.');
    // A specialist can also be the hidden Terrorist. Meetings remain available
    // during an emergency so refusing that role's exclusive repair cannot lock
    // the crew out of voting and subsequent reserve coverage.
    const secret = this.privatePlayers.get(id)!;
    if (secret.reported) return this.error(id, 'You already called your meeting for this flight.');
    if (this.now() - Math.max(this.roundStartedAt, this.lastMeetingAt) < 20000) return this.error(id, 'Meetings are on cooldown for 20 seconds.');
    this.securityActions.clear(); this.experience.cancel(); secret.reported = true; this.phase = 'meeting'; this.meetingRemaining = 30; this.votes = {}; this.inputs.clear(); this.challenges.clear(); this.interactions.clear(); this.story.stopControl();
    for (const player of this.players.values()) { player.weaponDrawn = false; player.equippedTool = null; }
    this.system(`${this.players.get(id)!.name} called a crew meeting. Vote to detain a suspect or skip.`);
  }
  private vote(id: string, target: unknown) {
    if (this.phase !== 'meeting' || !this.active(id)) return;
    const targetId = target === null || target === '' || target === undefined || target === 'skip' ? 'skip' : target;
    if (typeof targetId !== 'string' || (targetId !== 'skip' && !this.active(targetId))) return this.error(id, 'Choose an active crew member or skip.');
    if (Object.hasOwn(this.votes, id)) return this.error(id, 'Your vote is already recorded.');
    this.votes[id] = targetId;
    if (this.allVoted()) this.resolveMeeting();
  }
  private allVoted() { return [...this.players.values()].filter(p => !p.detained).every(p => Object.hasOwn(this.votes, p.id)); }
  private resolveMeeting() {
    const active = [...this.players.values()].filter(p => !p.detained);
    const counts = new Map<string, number>();
    for (const [voter, target] of Object.entries(this.votes)) if (this.active(voter) && target !== 'skip' && this.active(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
    const majority = [...counts.entries()].find(([, count]) => count > active.length / 2);
    if (majority) { this.players.get(majority[0])!.detained = true; this.players.get(majority[0])!.weaponDrawn = false; this.players.get(majority[0])!.equippedTool = null; if (this.safety.operatorId === majority[0] && this.safety.status !== 'complete') this.resetSafety(); this.system(`${this.players.get(majority[0])!.name} was detained by the crew. Their allegiance remains private.`); }
    else this.system('No majority. Nobody was detained.');
    this.phase = 'playing'; this.meetingRemaining = 0; this.votes = {}; this.lastMeetingAt = this.now(); this.inputs.clear(); this.checkSurvivors();
  }
  private checkSurvivors() {
    if (this.training || (this.phase !== 'playing' && this.phase !== 'meeting') || this.players.size === 0) return;
    const active = [...this.privatePlayers.entries()].filter(([id]) => !this.players.get(id)?.detained);
    if (!active.some(([, p]) => p.allegiance === 'saboteur') && !this.hostileSecured) { this.hostileSecured = true; }
    else if (!active.some(([, p]) => p.allegiance === 'crew')) this.end('saboteur', 'No active crew remain to secure the flight.');
  }
  private addChat(id: string, text: unknown) {
    if (this.sabotage === 'comms' && this.phase === 'playing') return this.error(id, 'Communications are offline. The First Officer must restore the flight-deck radio station.');
    const message = cleanText(text, 180);
    if (!message) return;
    if (this.now() - (this.lastChat.get(id) ?? -Infinity) < 750) return this.error(id, 'Please wait a moment before sending another message.');
    this.lastChat.set(id, this.now());
    this.chat.push({ id: ++this.chatId, name: this.players.get(id)!.name, text: message, system: false }); this.chat = this.chat.slice(-30);
  }
  private end(winner: Allegiance, outcome: string) { this.experience.cancel(); this.phase = 'ended'; this.winner = winner; this.outcome = outcome; this.inputs.clear(); this.challenges.clear(); this.interactions.clear(); this.story.stopControl(); if (this.safety.status !== 'complete') this.resetSafety(); this.meetingRemaining = 0; this.system(outcome); }
  private restart(id: string) {
    if (id !== this.hostId || this.phase !== 'ended') return this.error(id, 'Only the host can return a finished flight to the lobby.');
    this.experience.reset([...this.players.keys()]);
    this.phase = 'lobby'; this.integrity = 100; this.remaining = ROUND_SECONDS; this.sabotage = null; this.sabotageRemaining = 0; this.meetingRemaining = 0; this.votes = {}; this.winner = null; this.outcome = '';
    this.tasks = TASKS.map(t => ({ id: t.id, completed: false, completedBy: '' })); this.inputs.clear(); this.challenges.clear(); this.lastChallenge.clear(); this.flight.reset(); this.cabin.reset(); this.story.reset(); this.resetSafety(); this.interactions.clear(); this.unavailableRoleSeconds.clear(); this.standIn = 4;
    let index = 0;
    for (const [playerId, player] of this.players) { player.ready = false; player.detained = false; player.role = 'Passenger'; player.model = 'passenger-a'; player.weaponDrawn = false; player.equippedTool = null; player.carriedItem = null; player.x = -0.35; player.z = 7.3 - index * .95; player.yaw = 0; index++; this.privatePlayers.set(playerId, { allegiance: 'crew', sabotageReadyAt: 0, killReadyAt: 0, weaponDrawnAt: -Infinity, reported: false, objectives: new Set(), bombUsed: false }); }
    this.operations.reset([...this.players.keys()]); this.securityActions.clear(); this.captainAbsent = 0; this.securityAbsent = 0; this.hostileSecured = false;
    this.system('A new flight is boarding. Ready up when prepared.'); this.syncSecrets();
  }
  private stepReserveCoverage(dt: number) {
    if (this.training) return;
    const securityAvailable = [...this.players.values()].some(player => (player.role === 'Engineer' || player.role === 'Air Marshal') && !!this.active(player.id) && this.aboard(player.id));
    this.securityAbsent = this.operations.snapshot().bomb && !securityAvailable ? this.securityAbsent + dt : 0;
    if (this.securityAbsent + 1e-6 >= RESERVE_COVERAGE_SECONDS) { this.operations.disarm(1); this.securityAbsent = 0; this.system('NPC reserve security disarmed the cabin device after the specialist roles became unavailable.'); }
    for (const role of PUBLIC_ROLES) {
      // Only public availability matters. An idle or secretly hostile player still
      // owns their duties; reserve crew must not identify the hidden allegiance.
      if ([...this.players.values()].some(player => player.role === role && !!this.active(player.id))) { this.unavailableRoleSeconds.delete(role); continue; }
      const unavailable = (this.unavailableRoleSeconds.get(role) ?? 0) + dt;
      if (unavailable + 1e-6 < RESERVE_COVERAGE_SECONDS) { this.unavailableRoleSeconds.set(role, unavailable); continue; }
      this.unavailableRoleSeconds.set(role, 0);
      const work = this.experience.coverRole(role);
      if ([...this.players.values()].some(player => player.role === role && !!this.active(player.id))) {
        this.unavailableRoleSeconds.delete(role);
        if (work.length) this.system(`NPC reserve ${role} ${work.join('; ')}. The recovered player resumes their assigned duties.`);
        continue;
      }
      if (role === 'Captain' && this.story.coverFlight()) work.push('stabilized the aircraft on autopilot');
      if (role === 'Cabin Crew') {
        const standing = this.cabin.snapshot().filter(npc => npc.alive && npc.needsSeat);
        for (const npc of standing) this.cabin.guideToSeat(npc.id);
        if (standing.length) work.push('guided passengers back to their seats');
        // Service credit still represents actual fulfilled orders, even when the
        // reserve crew covers an unavailable player’s chapter objectives.
        let deliveries = 0;
        for (const npc of this.cabin.snapshot()) {
          if (!this.story.needed('serve-passenger')) break;
          if (npc.request && this.cabin.serve(npc.id, npc.request.id, npc.request.item)) { this.story.credit('serve-passenger'); deliveries++; }
        }
        for (const target of this.experience.serviceTargets()) {
          if (!this.story.needed('serve-passenger')) break;
          if (this.experience.deliver(target.id, target.request.id)) { this.story.credit('serve-passenger'); deliveries++; }
        }
        if (deliveries) work.push(`delivered ${deliveries} passenger order${deliveries === 1 ? '' : 's'}`);
      }
      const objectives = this.story.snapshot().objectives;
      const covered = this.story.coverRole(role, id => id !== 'serve-passenger' && (id !== 'cabin-check' || this.cabin.allSeated()));
      for (const id of covered) {
        if (id === 'safety-demo') { this.resetSafety(); this.safety = { status: 'complete', operatorId: null, step: SAFETY_INSTRUCTIONS.length - 1, elapsed: SAFETY_STEP_DURATIONS.at(-1)! }; }
        if (id.startsWith('task:')) {
          const task = this.tasks.find(task => task.id === id.slice(5));
          if (task) { task.completed = true; task.completedBy = 'npc-crew'; }
        }
        work.push(objectives.find(objective => objective.id === id)!.label.toLowerCase());
      }
      if (this.sabotage) {
        const sabotage = this.sabotage;
        const repair = TASKS.find(task => task.id === REPAIR_STATIONS[sabotage]);
        if (repair?.role === role) {
          work.push(`restored ${this.sabotage === 'blackout' ? 'cabin power' : this.sabotage === 'comms' ? 'communications' : 'navigation'}`);
          this.sabotage = null; this.sabotageRemaining = 0; this.integrity = Math.min(100, this.integrity + 8);
        }
      }
      if (work.length) this.system(`NPC reserve ${role} covered the unavailable role: ${work.join('; ')}. Player duties remain unchanged.`);
    }
  }
  step(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    const dt = Math.min(0.1, Math.max(0, seconds));
    if (this.phase === 'ended') { if (this.operations.stage === 'crashed') this.operations.step(dt, this.now(), () => false); return; }
    if (this.phase === 'lobby' || this.phase === 'playing') for (const [id, input] of this.inputs) {
      const player = this.active(id);
      if (!player || this.now() - input.at > 250 || (this.safety.status === 'demonstrating' && this.safety.operatorId === id)) { this.inputs.delete(id); continue; }
      if (this.phase === 'playing' && !this.aboard(id)) Object.assign(player, moveTerminal(player.x, player.z, input.dx, input.dz, dt), { yaw: input.yaw });
      else if (!['takeoff', 'landing'].includes(this.operations.stage)) Object.assign(player, movePlayer(player.x, player.z, input.dx, input.dz, dt), { yaw: input.yaw });
    }
    if (this.phase === 'meeting') { this.meetingRemaining = Math.max(0, this.meetingRemaining - dt); if (!this.meetingRemaining) this.resolveMeeting(); return; }
    if (this.phase !== 'playing') return;
    this.remaining = Math.max(0, this.remaining - dt);
    const captainAvailable = [...this.players.values()].some(p => p.role === 'Captain' && !!this.active(p.id) && this.aboard(p.id));
    this.captainAbsent = captainAvailable ? 0 : this.captainAbsent + dt;
    const reservePilot = !this.training && this.captainAbsent >= RESERVE_COVERAGE_SECONDS;
    const previousStage = this.operations.stage;
    if (reservePilot && previousStage === 'boarding' && this.operations.allBoarded([...this.players.values()]) && this.story.ready && this.cabin.allSeated() && !this.experience.unresolved && !this.sabotage && !this.operations.snapshot().bomb) this.operations.startTakeoff('npc-reserve-pilot');
    if (reservePilot && previousStage === 'cruise' && this.operations.snapshot().landingReady && !this.experience.unresolved && !this.sabotage && !this.operations.snapshot().bomb) this.operations.startLanding('npc-reserve-pilot');
    this.operations.step(dt, this.now(), id => this.atFlightControls(id), reservePilot);
    if (this.operations.stage === 'crashed') { this.crash(this.operations.snapshot().crashReason); return; }
    if (this.operations.stage === 'arrived') { this.end('crew', 'FLIGHT 404 has landed safely. The crew completed the journey.'); return; }
    if (previousStage === 'takeoff' && this.operations.stage === 'cruise') { this.story.advance(); this.standIn = 45; this.interactions.clear(); this.system('Cruise altitude reached. The cabin is open for service.'); this.system(this.story.snapshot().instruction); }
    if (this.operations.stage === 'takeoff' || this.operations.stage === 'landing') { if (this.remaining <= 0) this.crash('The flight ran out of time over the ocean.'); return; }
    if (this.operations.stage === 'cruise') this.flight.step(dt, ROUND_SECONDS);
    this.stepSecurityActions(dt);
    this.integrity = Math.max(0, this.integrity - this.cabin.step(dt, { targets: this.experience.serviceTargets(), claim: (id, requestId, claimedBy) => this.experience.setClaim(id, requestId, claimedBy), deliver: (id, requestId) => this.experience.deliver(id, requestId) }));
    this.stepActions(dt);
    this.stepSafety(dt);
    this.story.step(dt, this.now(), id => this.atFlightControls(id));
    this.experience.step(dt, this.operations.stage === 'cruise' && this.story.stage === 'turbulence', this.story.snapshot().elapsed);
    for (const player of this.players.values()) if (player.detained || this.experience.member(player.id)?.incapacitated || !player.weaponDrawn && player.equippedTool !== 'bomb') player.equippedTool = null;
    this.stepReserveCoverage(dt);
    this.standIn -= dt;
    if (this.standIn <= 0) {
      // Two fixed safety incidents are part of the story; cruise also has occasional aisle activity.
      if (this.story.needed('guide-passenger') && !this.cabin.snapshot().some(n => n.needsSeat)) this.cabin.requestStanding(this.story.stage === 'turbulence' ? 2 : 1);
      else if (this.story.stage === 'service') this.cabin.requestStanding(1);
      this.standIn = this.story.stage === 'service' ? 45 : 8;
    }
    if (this.operations.stage === 'cruise' && this.story.ready && this.cabin.allSeated() && !this.experience.unresolved && (!this.story.snapshot().turbulence.active || this.story.snapshot().turbulence.stability >= this.story.snapshot().turbulence.required)) {
      const stage = this.story.advance();
      if (stage) { this.system(this.story.snapshot().instruction); this.standIn = stage === 'turbulence' ? .5 : 45; this.interactions.clear(); }
      else if (this.story.stage === 'approach' && !this.sabotage) { if (!this.operations.snapshot().landingReady) this.system('Arrival checks complete. The Captain can begin the landing from the flight deck.'); this.operations.readyForLanding(); }
    }
    if (this.phase !== 'playing') return;
    this.checkSurvivors();
    if (this.phase !== 'playing') return;
    if (this.sabotage) { this.sabotageRemaining = Math.max(0, this.sabotageRemaining - dt); this.integrity = Math.max(0, this.integrity - dt * 0.75); if (this.sabotageRemaining <= 0) this.integrity = 0; }
    if (this.integrity <= 0) this.crash('An unresolved emergency brought FLIGHT 404 down over the ocean.');
    else if (this.remaining <= 0) this.end('saboteur', 'The flight window expired before the crew completed the journey.');
  }
}
