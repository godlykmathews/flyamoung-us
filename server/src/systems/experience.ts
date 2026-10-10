import { randomUUID } from 'node:crypto';
import { EXPERIENCE_ACTION_DURATIONS, type ExperienceAction, type ExperienceActionKind, type ExperienceState, type IncidentKind, type PassengerExperience, type Player, type ServiceItem } from '../../../shared/protocol.js';
import { EXPERIENCE_STATIONS, hasCabinSight } from '../../../shared/world.js';
import { CabinSimulation, SERVICE_ITEMS } from './cabin.js';

type Payload = Record<string, unknown>;
interface ExperiencePort {
  training: boolean;
  now(): number;
  playing(): boolean;
  players(): Player[];
  cabin: CabinSimulation;
  canAct(id: string): boolean;
  saboteur(id: string): boolean;
  covertReady(id: string): boolean;
  useCovert(id: string): void;
  error(id: string, message: string): void;
  announce(message: string): void;
  creditService(): void;
  damage(amount: number): void;
  weather(): boolean;
}
const freshPassenger = (): PassengerExperience => ({ order: null, received: [], seatbelt: false, oxygenMask: false, activity: 'idle', incapacitated: false });
const covertKinds: ExperienceActionKind[] = ['wrong-order', 'poison-pilot', 'damage-pressure', 'damage-electrical'];
const incidentKinds: ExperienceActionKind[] = ['use-mask', 'assist-mask', 'repair-pressure', 'extinguish-smoke'];
const stationaryKinds: ExperienceActionKind[] = ['fasten-seatbelt', 'read', 'rest', 'use-mask'];

/** Fictional flight incidents and passenger activities use one authoritative held-action clock.
 * The only client inputs are intent and keepalives. Pauses never advance incident or rescue clocks. */
export class ExperienceSimulation {
  private state: ExperienceState = { incident: 'none', severity: 0, remaining: 0, masksDeployed: false, pilotCondition: 'healthy', pilotRecovery: 0, agitated: [], players: {}, actions: [] };
  private actions = new Map<string, Omit<ExperienceAction, 'kind'> & { kind: ExperienceActionKind; lastAt: number; x: number; z: number; requestId: string | null; incidentRevision: number }>();
  private naturalPressureTriggered = false;
  private incidentRevision = 0;
  constructor(private port: ExperiencePort) {}
  reset(ids: string[]) {
    this.state = { incident: 'none', severity: 0, remaining: 0, masksDeployed: false, pilotCondition: 'healthy', pilotRecovery: 0, agitated: [], players: Object.fromEntries(ids.map(id => [id, freshPassenger()])), actions: [] };
    this.actions.clear(); this.naturalPressureTriggered = false; this.incidentRevision++;
  }
  add(id: string) { this.state.players[id] = freshPassenger(); }
  remove(id: string) { delete this.state.players[id]; this.actions.delete(id); for (const [operator, action] of this.actions) if (action.targetId === id) this.actions.delete(operator); }
  member(id: string) { return this.state.players[id]; }
  get unresolved() { return this.state.incident !== 'none' || this.state.pilotCondition !== 'healthy' || !this.port.cabin.get('pilot')?.alive || Object.values(this.state.players).some(p => p.incapacitated); }
  // Benign and covert holds share one public shape. The acting client retains its
  // own intent locally; request bindings and incident generations never leave the server.
  snapshot(): ExperienceState { return { ...this.state, agitated: [...this.state.agitated], players: Object.fromEntries(Object.entries(this.state.players).map(([id, p]) => [id, { ...p, received: [...p.received], order: p.order ? { ...p.order } : null }])), actions: [...this.actions.values()].map(({ lastAt: _, x: _x, z: _z, requestId: _request, incidentRevision: _revision, ...action }) => ({ ...action, kind: 'working' as const, targetId: '' })) }; }
  cancel(id?: string) { if (id) this.actions.delete(id); else this.actions.clear(); }
  moving(id: string) { const member = this.member(id); if (member) { member.activity = 'idle'; member.seatbelt = false; } if (stationaryKinds.includes(this.actions.get(id)?.kind as ExperienceActionKind)) this.cancel(id); }
  incapacitate(id: string) {
    const member = this.member(id); if (!member || member.incapacitated) return false;
    member.incapacitated = true; member.activity = 'idle'; member.seatbelt = false; this.cancel(id);
    const player = this.port.players().find(p => p.id === id); if (player) { player.weaponDrawn = false; player.carriedItem = null; }
    return true;
  }
  private player(id: string) { return this.port.players().find(player => player.id === id); }
  private near(player: Player, target: { x: number; z: number }, radius = 2.25) { return Math.hypot(player.x - target.x, player.z - target.z) < radius && hasCabinSight(player, target); }
  request(id: string, item: unknown) {
    const member = this.member(id);
    if (!this.port.playing() || !this.port.canAct(id) || !member) return;
    if (!SERVICE_ITEMS.includes(item as ServiceItem)) return this.port.error(id, 'Choose water, coffee, a meal or a blanket.');
    if (member.order) return this.port.error(id, 'Your current order is on its way.');
    if (member.received.includes(item as ServiceItem)) return this.port.error(id, 'Try another item to complete your four-item journey.');
    member.order = { id: randomUUID(), item: item as ServiceItem, remaining: 90, claimedBy: null };
  }
  serve(id: string, data: Payload) {
    const player = this.player(id), target = typeof data.playerId === 'string' ? this.player(data.playerId) : undefined;
    const member = target && this.member(target.id);
    if (!this.port.playing() || !player || !target || !this.port.canAct(id) || player.weaponDrawn || id === target.id || target.detained || !member?.order || member.order.id !== data.requestId) return this.port.error(id, 'Choose another passenger with a current request.');
    if (!this.near(player, target, 2.4)) return this.port.error(id, 'Carry the requested item to the passenger.');
    if (player.carriedItem !== member.order.item) return this.port.error(id, 'Bring the item shown on their request.');
    this.deliver(target.id, member.order.id); player.carriedItem = null; this.port.creditService();
  }
  deliver(id: string, requestId: string) {
    const member = this.member(id); if (!member?.order || member.order.id !== requestId) return false;
    member.received.push(member.order.item); member.order = null; return true;
  }
  /** Read-only routing input for the cabin attendant. Human crew retain the first 20 seconds. */
  serviceTargets() { return this.port.players().filter(p => !p.detained && !this.member(p.id)?.incapacitated).flatMap(p => { const order = this.member(p.id)?.order; return order ? [{ id: p.id, x: p.x, z: p.z, request: { ...order } }] : []; }); }
  setClaim(id: string, requestId: string, claimedBy: string | null) { const order = this.member(id)?.order; if (order?.id === requestId) order.claimedBy = claimedBy; }
  trigger(kind: Exclude<IncidentKind, 'none'>) {
    if (this.state.incident !== 'none') return false;
    this.incidentRevision++; this.state.incident = kind; this.state.remaining = 85; this.state.severity = .2; this.state.masksDeployed = kind === 'decompression';
    if (kind === 'decompression') { for (const member of Object.values(this.state.players)) member.oxygenMask = false; this.port.announce('CABIN PRESSURE ALERT. Oxygen masks have dropped. Put on a mask and restore the cabin pressure console.'); }
    else this.port.announce('SMOKE ALERT. Smoke detected near the aft electrical cabinet. Contain it at the safety cabinet.');
    return true;
  }
  drill(id: string, kind: unknown) {
    if (!this.port.training || !this.port.playing() || !this.port.canAct(id)) return this.port.error(id, 'Incident drills are available only in solo practice.');
    if (kind === 'decompression' || kind === 'smoke') { if (!this.trigger(kind)) this.port.error(id, 'Resolve the current cabin incident before starting another drill.'); }
    else if (kind === 'medical') { if (this.state.pilotCondition !== 'healthy') return this.port.error(id, 'Assist the pilot before starting another medical drill.'); this.poisonPilot(); }
    else if (kind === 'weather') { if (!this.port.weather()) this.port.error(id, 'Stabilize the current weather encounter before starting another.'); }
    else this.port.error(id, 'Choose a cabin pressure, smoke, pilot assistance or weather drill.');
  }
  private poisonPilot() { this.state.pilotCondition = 'poisoned'; this.state.pilotRecovery = 0; this.port.announce('The pilot needs assistance on the flight deck. Autopilot is holding the route.'); }
  private valid(id: string, kind: ExperienceActionKind, targetId: string) {
    const player = this.player(id), member = this.member(id);
    if (!this.port.playing() || !player || !member || !this.port.canAct(id) || player.weaponDrawn || !(kind in EXPERIENCE_ACTION_DURATIONS)) return false;
    if (covertKinds.includes(kind) && (!this.port.saboteur(id) || !this.port.covertReady(id))) return false;
    const targetPlayer = this.player(targetId), targetMember = this.member(targetId), npc = this.port.cabin.get(targetId);
    switch (kind) {
      case 'fasten-seatbelt': case 'read': case 'rest': return targetId === id && player.z > -9 && player.z < 8 && (kind !== 'fasten-seatbelt' || !member.seatbelt);
      case 'use-mask': return targetId === id && this.state.masksDeployed && !member.oxygenMask && player.z > -9 && player.z < 8;
      case 'assist-mask': return !!targetPlayer && !targetPlayer.detained && !!targetMember && targetId !== id && this.state.masksDeployed && member.oxygenMask && !targetMember.oxygenMask && this.near(player, targetPlayer);
      case 'repair-pressure': return targetId === 'pressure' && this.state.incident === 'decompression' && member.oxygenMask && this.near(player, EXPERIENCE_STATIONS.pressure);
      case 'extinguish-smoke': return targetId === 'electrical' && this.state.incident === 'smoke' && this.near(player, EXPERIENCE_STATIONS.electrical);
      case 'aid-pilot': return targetId === 'pilot' && (this.state.pilotCondition === 'poisoned' || !this.port.cabin.get('pilot')?.alive) && this.near(player, EXPERIENCE_STATIONS.pilot);
      case 'rescue-player': return !!targetPlayer && !targetPlayer.detained && !!targetMember?.incapacitated && this.near(player, targetPlayer);
      case 'disarm': return !!targetPlayer && targetId !== id && !targetPlayer.detained && targetPlayer.weaponDrawn && this.near(player, targetPlayer, 1.9) && (this.port.training || ['Captain', 'First Officer', 'Air Marshal'].includes(player.role));
      case 'wrong-order': return !!npc?.alive && npc.kind === 'passenger' && !!npc.request && !!player.carriedItem && player.carriedItem !== npc.request.item && this.near(player, npc, 2.4);
      case 'calm-passenger': return !!npc?.alive && this.state.agitated.includes(targetId) && this.near(player, npc, 2.4);
      case 'poison-pilot': return targetId === 'pilot' && this.state.pilotCondition === 'healthy' && !!this.port.cabin.get('pilot')?.alive && (player.carriedItem === 'water' || player.carriedItem === 'coffee') && this.near(player, EXPERIENCE_STATIONS.pilot);
      case 'damage-pressure': return targetId === 'pressure' && this.state.incident === 'none' && this.near(player, EXPERIENCE_STATIONS.pressure);
      case 'damage-electrical': return targetId === 'electrical' && this.state.incident === 'none' && this.near(player, EXPERIENCE_STATIONS.electrical);
    }
  }
  action(id: string, data: Payload) {
    if (data.phase === 'cancel') { this.cancel(id); return; }
    if (data.phase === 'maintain') { const action = this.actions.get(id); if (action && this.port.playing()) action.lastAt = this.port.now(); return; }
    if (data.phase !== 'begin' || typeof data.kind !== 'string' || typeof data.targetId !== 'string' || !this.valid(id, data.kind as ExperienceActionKind, data.targetId)) return this.port.error(id, 'Move close to an available activity. Pressure repairs require your oxygen mask; covert actions require the hidden saboteur role.');
    const player = this.player(id)!; if (this.actions.has(id)) return;
    this.actions.set(id, { playerId: id, kind: data.kind as ExperienceActionKind, targetId: data.targetId, progress: 0, duration: EXPERIENCE_ACTION_DURATIONS[data.kind as ExperienceActionKind], lastAt: this.port.now(), x: player.x, z: player.z, requestId: data.kind === 'wrong-order' ? this.port.cabin.get(data.targetId)?.request?.id ?? null : null, incidentRevision: this.incidentRevision });
  }
  private complete(id: string, kind: ExperienceActionKind, targetId: string) {
    const member = this.member(id)!, player = this.player(id)!;
    if (covertKinds.includes(kind)) this.port.useCovert(id);
    switch (kind) {
      case 'fasten-seatbelt': member.seatbelt = true; member.activity = 'idle'; break;
      case 'read': member.activity = 'reading'; break;
      case 'rest': member.activity = 'resting'; break;
      case 'use-mask': member.oxygenMask = true; break;
      case 'assist-mask': this.member(targetId)!.oxygenMask = true; break;
      case 'repair-pressure': case 'extinguish-smoke': this.state.incident = 'none'; this.state.remaining = 0; this.state.severity = 0; this.state.masksDeployed = false; for (const p of Object.values(this.state.players)) p.oxygenMask = false; this.port.announce(kind === 'repair-pressure' ? 'Cabin pressure restored. The cabin is safe again.' : 'Smoke contained. Cabin visibility is clearing.'); break;
      case 'aid-pilot': this.port.cabin.revive('pilot'); this.state.pilotCondition = 'recovering'; this.state.pilotRecovery = 5; this.port.announce('The pilot is recovering. Thank you for assisting.'); break;
      case 'rescue-player': this.member(targetId)!.incapacitated = false; this.port.announce(`${this.player(targetId)!.name} has been assisted and can move again.`); break;
      case 'disarm': { const target = this.player(targetId)!; target.weaponDrawn = false; target.detained = true; target.carriedItem = null; this.cancel(targetId); this.port.announce(`${target.name} was disarmed and detained after exposing a weapon. Their allegiance remains private.`); break; }
      case 'wrong-order': if (this.port.cabin.wrongOrder(targetId)) { player.carriedItem = null; this.state.agitated.push(targetId); this.port.announce('A passenger is upset about their service. Calm them and help them return to their seat.'); } break;
      case 'calm-passenger': this.state.agitated = this.state.agitated.filter(n => n !== targetId); this.port.cabin.guideToSeat(targetId); break;
      case 'poison-pilot': player.carriedItem = null; this.poisonPilot(); break;
      case 'damage-pressure': this.trigger('decompression'); break;
      case 'damage-electrical': this.trigger('smoke'); break;
    }
  }
  step(dt: number, turbulence: boolean, turbulenceElapsed: number) {
    if (!this.port.playing()) return;
    if (turbulence && turbulenceElapsed >= 12 && !this.naturalPressureTriggered && this.state.incident === 'none') { this.naturalPressureTriggered = true; this.trigger('decompression'); }
    for (const member of Object.values(this.state.players)) if (member.order) { member.order.remaining = Math.max(0, member.order.remaining - dt); if (!member.order.remaining) member.order = null; }
    for (const [id, action] of this.actions) {
      const player = this.player(id);
      if (!player || (action.kind === 'wrong-order' && this.port.cabin.get(action.targetId)?.request?.id !== action.requestId) || (incidentKinds.includes(action.kind) && action.incidentRevision !== this.incidentRevision) || this.port.now() - action.lastAt > 500 || !this.valid(id, action.kind, action.targetId) || (stationaryKinds.includes(action.kind) && Math.hypot(player.x - action.x, player.z - action.z) > .1)) { this.actions.delete(id); continue; }
      action.progress = Math.min(action.duration, action.progress + dt);
      if (action.progress + 1e-6 < action.duration) continue;
      this.actions.delete(id); this.complete(id, action.kind, action.targetId);
    }
    if (this.state.pilotCondition === 'recovering') { this.state.pilotRecovery = Math.max(0, this.state.pilotRecovery - dt); if (!this.state.pilotRecovery) this.state.pilotCondition = 'healthy'; }
    if (this.state.pilotCondition === 'poisoned') this.port.damage(dt * .08);
    if (this.state.incident !== 'none') {
      this.state.remaining = Math.max(0, this.state.remaining - dt); this.state.severity = Math.min(1, .2 + (85 - this.state.remaining) / 85 * .8);
      this.port.damage(dt * (this.state.incident === 'smoke' ? .22 : .12));
      if (this.state.remaining <= 0) this.port.damage(100);
    }
    this.state.agitated = this.state.agitated.filter(id => this.port.cabin.get(id)?.alive && this.port.cabin.get(id)?.needsSeat);
  }
}
