import { randomInt, randomUUID } from 'node:crypto';
import type { Allegiance, ChatMessage, MoveInput, Player, SabotageKind, Secret, Snapshot, TaskChallenge } from '../../../shared/protocol.js';
import { COLORS } from '../../../shared/protocol.js';
import { movePlayer, TASKS } from '../../../shared/world.js';
import { AutopilotController, type FlightController } from './flight.js';
import { assignRoles } from './roles.js';

const ROUND_SECONDS = 360;
export const REPAIR_STATIONS: Record<SabotageKind, string> = { blackout: 'electrical', comms: 'meals', navigation: 'navigation' };
type Payload = Record<string, unknown>;
type Send = (id: string, type: string, payload: unknown) => void;
interface PrivatePlayer { allegiance: Allegiance; sabotageReadyAt: number; reported: boolean; }
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

  constructor(readonly roomId: string, readonly training: boolean, private send: Send, private now: () => number = Date.now, private flight: FlightController = new AutopilotController()) {}
  get currentPhase() { return this.phase; }
  get size() { return this.players.size; }
  private error(id: string, message: string) { this.send(id, 'error', { message }); }
  private system(text: string) { this.chat.push({ id: ++this.chatId, name: 'FLIGHT 404', text, system: true }); this.chat = this.chat.slice(-30); }
  private active(id: string) { const player = this.players.get(id); return player && !player.detained ? player : undefined; }
  private near(id: string, taskId: string) { const player = this.active(id), task = TASKS.find(t => t.id === taskId); return !!player && !!task && Math.hypot(player.x - task.x, player.z - task.z) < 2.25; }

  addPlayer(id: string, name: unknown) {
    if (this.phase !== 'lobby') throw new Error('This flight has already departed.');
    if (this.players.size >= (this.training ? 1 : 10)) throw new Error('This flight is full.');
    const index = this.players.size;
    const color = COLORS.find(c => ![...this.players.values()].some(p => p.color === c)) ?? COLORS[index % COLORS.length];
    this.players.set(id, { id, name: cleanText(name, 18) || `Crew ${index + 1}`, color, x: (index % 3 - 1) * 0.35, z: 7.3 + Math.floor(index / 3) * 0.35, yaw: 0, role: 'Passenger', ready: false, detained: false });
    this.privatePlayers.set(id, { allegiance: 'crew', sabotageReadyAt: 0, reported: false });
    if (!this.hostId) this.hostId = id;
    this.system(`${this.players.get(id)!.name} boarded the flight.`);
  }
  removePlayer(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id); this.privatePlayers.delete(id); this.inputs.delete(id); this.challenges.delete(id); this.lastChat.delete(id); this.lastChallenge.delete(id);
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
      allegiance: secret?.allegiance ?? 'crew',
      teammates: secret?.allegiance === 'saboteur' ? [...this.privatePlayers].filter(([other, p]) => other !== id && p.allegiance === 'saboteur').map(([other]) => other) : [],
      cooldown: Math.max(0, Math.ceil(((secret?.sabotageReadyAt ?? 0) - this.now()) / 1000)),
    };
  }
  sync(id: string) { this.send(id, 'snapshot', this.snapshot()); this.send(id, 'secret', this.getSecret(id)); }
  syncSecrets() { for (const id of this.players.keys()) this.send(id, 'secret', this.getSecret(id)); }
  snapshot(): Snapshot {
    return { roomId: this.roomId, hostId: this.hostId, training: this.training, phase: this.phase,
      players: [...this.players.values()].map(p => ({ ...p })), tasks: this.tasks.map(t => ({ ...t })),
      integrity: this.integrity, remaining: this.remaining, sabotage: this.sabotage, sabotageRemaining: this.sabotageRemaining,
      meetingRemaining: this.meetingRemaining, votes: { ...this.votes }, winner: this.winner, outcome: this.outcome,
      flight: this.flight.snapshot(), chat: this.chat.map(m => ({ ...m })) };
  }
  handle(id: string, type: string, raw: unknown) {
    if (!this.players.has(id)) return;
    const data = record(raw);
    switch (type) {
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
    }
  }
  private start(id: string) {
    if (id !== this.hostId || this.phase !== 'lobby') return this.error(id, 'Only the host can start from the lobby.');
    if (this.players.size < (this.training ? 1 : 3)) return this.error(id, 'At least 3 players are needed. Use training to explore solo.');
    if ([...this.players.values()].some(p => !p.ready)) return this.error(id, 'Every player must be ready before departure.');
    this.phase = 'playing'; this.roundStartedAt = this.now(); this.lastMeetingAt = this.now(); this.flight.reset();
    for (const [playerId, assignment] of assignRoles([...this.players.keys()], this.training)) {
      this.players.get(playerId)!.role = assignment.role;
      this.privatePlayers.set(playerId, { allegiance: assignment.allegiance, sabotageReadyAt: this.now() + 15000, reported: false });
    }
    this.system(this.training ? 'Training started. Complete the five stations to land safely.' : 'Flight departed. Complete five stations, repair emergencies, and identify the saboteurs.');
    this.syncSecrets();
  }
  private move(id: string, data: Payload) {
    if ((this.phase !== 'playing' && this.phase !== 'lobby') || !this.active(id)) return;
    if (typeof data.dx !== 'number' || typeof data.dz !== 'number' || typeof data.yaw !== 'number' || !Number.isFinite(data.dx) || !Number.isFinite(data.dz) || !Number.isFinite(data.yaw)) return;
    const length = Math.max(1, Math.hypot(data.dx, data.dz));
    this.inputs.set(id, { dx: data.dx / length, dz: data.dz / length, yaw: ((data.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), at: this.now() });
  }
  private beginTask(id: string, taskId: unknown) {
    if (this.phase !== 'playing' || !this.active(id)) return this.error(id, 'Tasks are available to active crew during flight.');
    if (typeof taskId !== 'string' || !this.near(id, taskId)) return this.error(id, 'Move closer to the station to interact.');
    const task = this.tasks.find(t => t.id === taskId)!;
    const isRepair = this.sabotage !== null && REPAIR_STATIONS[this.sabotage] === taskId;
    if (task.completed && !isRepair) return this.error(id, 'This station is already complete.');
    if (this.now() - (this.lastChallenge.get(id) ?? -Infinity) < 500) return;
    this.lastChallenge.set(id, this.now());
    const challenge: Challenge = { taskId, token: randomUUID(), sequence: Array.from({ length: 4 }, () => randomInt(4)), startedAt: this.now(), sabotage: isRepair ? this.sabotage : null };
    this.challenges.set(id, challenge);
    this.send(id, 'challenge', { taskId, token: challenge.token, sequence: [...challenge.sequence] } satisfies TaskChallenge);
  }
  private completeTask(id: string, data: Payload) {
    if (this.phase !== 'playing' || !this.active(id)) return;
    const challenge = this.challenges.get(id);
    if (!challenge || data.token !== challenge.token || data.taskId !== challenge.taskId) return this.error(id, 'The station session expired. Open it again.');
    if (!this.near(id, challenge.taskId)) return this.error(id, 'Stay near the station while working.');
    const elapsed = this.now() - challenge.startedAt;
    if (elapsed < 1200) return this.error(id, 'Follow the sequence before confirming.');
    if (elapsed > 30000) { this.challenges.delete(id); return this.error(id, 'The station session expired. Open it again.'); }
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
    if (this.tasks.every(t => t.completed) && !this.sabotage) this.end('crew', 'All five stations are secured. FLIGHT 404 arrived safely.');
  }
  private triggerSabotage(id: string, kind: unknown) {
    const secret = this.privatePlayers.get(id)!;
    if (this.phase !== 'playing' || !this.active(id) || secret.allegiance !== 'saboteur') return this.error(id, 'Only an active saboteur can disrupt this flight.');
    if (kind !== 'blackout' && kind !== 'comms' && kind !== 'navigation') return this.error(id, 'Unknown disruption.');
    if (this.sabotage) return this.error(id, 'An emergency is already active.');
    if (secret.sabotageReadyAt > this.now()) return this.error(id, 'Your disruption is recharging.');
    this.sabotage = kind; this.sabotageRemaining = 55; secret.sabotageReadyAt = this.now() + 35000;
    this.system(`${kind === 'blackout' ? 'POWER FAILURE' : kind === 'comms' ? 'COMMS OFFLINE' : 'ROUTE FAULT'}: restore the ${TASKS.find(t => t.id === REPAIR_STATIONS[kind])!.area.toLowerCase()} station within 55 seconds.`);
    this.syncSecrets();
  }
  private report(id: string) {
    if (this.phase !== 'playing' || !this.active(id)) return;
    if (this.training) return this.error(id, 'Crew meetings are available in multiplayer flights.');
    if (this.sabotage) return this.error(id, 'Repair the active emergency before calling a meeting.');
    const secret = this.privatePlayers.get(id)!;
    if (secret.reported) return this.error(id, 'You already called your meeting for this flight.');
    if (this.now() - Math.max(this.roundStartedAt, this.lastMeetingAt) < 20000) return this.error(id, 'Meetings are on cooldown for 20 seconds.');
    secret.reported = true; this.phase = 'meeting'; this.meetingRemaining = 30; this.votes = {}; this.inputs.clear(); this.challenges.clear();
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
    if (majority) { this.players.get(majority[0])!.detained = true; this.system(`${this.players.get(majority[0])!.name} was detained by the crew. Their allegiance remains private.`); }
    else this.system('No majority. Nobody was detained.');
    this.phase = 'playing'; this.meetingRemaining = 0; this.votes = {}; this.lastMeetingAt = this.now(); this.inputs.clear(); this.checkSurvivors();
  }
  private checkSurvivors() {
    if (this.training || (this.phase !== 'playing' && this.phase !== 'meeting') || this.players.size === 0) return;
    const active = [...this.privatePlayers.entries()].filter(([id]) => this.active(id));
    if (!active.some(([, p]) => p.allegiance === 'saboteur')) this.end('crew', 'The saboteurs are no longer active. The crew secured FLIGHT 404.');
    else if (!active.some(([, p]) => p.allegiance === 'crew')) this.end('saboteur', 'No active crew remain to secure the flight.');
  }
  private addChat(id: string, text: unknown) {
    if (this.sabotage === 'comms' && this.phase === 'playing') return this.error(id, 'Communications are offline. Restore the aft galley station.');
    const message = cleanText(text, 180);
    if (!message) return;
    if (this.now() - (this.lastChat.get(id) ?? -Infinity) < 750) return this.error(id, 'Please wait a moment before sending another message.');
    this.lastChat.set(id, this.now());
    this.chat.push({ id: ++this.chatId, name: this.players.get(id)!.name, text: message, system: false }); this.chat = this.chat.slice(-30);
  }
  private end(winner: Allegiance, outcome: string) { this.phase = 'ended'; this.winner = winner; this.outcome = outcome; this.inputs.clear(); this.challenges.clear(); this.meetingRemaining = 0; this.system(outcome); }
  private restart(id: string) {
    if (id !== this.hostId || this.phase !== 'ended') return this.error(id, 'Only the host can return a finished flight to the lobby.');
    this.phase = 'lobby'; this.integrity = 100; this.remaining = ROUND_SECONDS; this.sabotage = null; this.sabotageRemaining = 0; this.meetingRemaining = 0; this.votes = {}; this.winner = null; this.outcome = '';
    this.tasks = TASKS.map(t => ({ id: t.id, completed: false, completedBy: '' })); this.inputs.clear(); this.challenges.clear(); this.lastChallenge.clear(); this.flight.reset();
    let index = 0;
    for (const [playerId, player] of this.players) { player.ready = false; player.detained = false; player.role = 'Passenger'; player.x = (index % 3 - 1) * 0.35; player.z = 7.3 + Math.floor(index / 3) * 0.35; player.yaw = 0; index++; this.privatePlayers.set(playerId, { allegiance: 'crew', sabotageReadyAt: 0, reported: false }); }
    this.system('A new flight is boarding. Ready up when prepared.'); this.syncSecrets();
  }
  step(seconds: number) {
    const dt = Math.min(0.1, Math.max(0, seconds));
    if (this.phase === 'lobby' || this.phase === 'playing') for (const [id, input] of this.inputs) {
      const player = this.active(id);
      if (!player || this.now() - input.at > 250) { this.inputs.delete(id); continue; }
      Object.assign(player, movePlayer(player.x, player.z, input.dx, input.dz, dt), { yaw: input.yaw });
    }
    if (this.phase === 'meeting') { this.meetingRemaining = Math.max(0, this.meetingRemaining - dt); if (!this.meetingRemaining) this.resolveMeeting(); return; }
    if (this.phase !== 'playing') return;
    this.remaining = Math.max(0, this.remaining - dt); this.flight.step(dt, ROUND_SECONDS);
    if (this.sabotage) { this.sabotageRemaining = Math.max(0, this.sabotageRemaining - dt); this.integrity = Math.max(0, this.integrity - dt * 0.75); if (this.sabotageRemaining <= 0) this.integrity = 0; }
    if (this.integrity <= 0) this.end('saboteur', 'An unresolved emergency grounded FLIGHT 404. The saboteurs won.');
    else if (this.remaining <= 0) this.end('saboteur', 'The flight window expired before all stations were secured.');
  }
}
