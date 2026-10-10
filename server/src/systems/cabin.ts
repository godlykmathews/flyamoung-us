import { randomInt, randomUUID } from 'node:crypto';
import type { CabinNpc, CabinServiceState, ServiceItem } from '../../../shared/protocol.js';
import { AI_GALLEY_STOP, NPC_PASSENGER_SEATS, PILOT_NPC, canStand } from '../../../shared/world.js';

export const SERVICE_ITEMS: readonly ServiceItem[] = ['water', 'coffee', 'meal', 'blanket'];
export const REQUEST_SECONDS = 85;
export const HUMAN_SERVICE_PRIORITY_SECONDS = 15;
const ATTENDANT_SPEED = 1.35;
type Point = { x: number; z: number };
interface HumanServicePort {
  targets: Array<Point & { id: string; request: { id: string; item: ServiceItem; remaining: number } }>;
  claim(id: string, requestId: string, claimedBy: string | null): void;
  deliver(id: string, requestId: string): boolean;
}


/** Cabin life is simulated on the server, with no dependency on sabotage state.
 * Clocks advance only when FlightGame is playing, so meetings pause service.
 */
export class CabinSimulation {
  private npcs = new Map<string, CabinNpc>();
  private service: CabinServiceState = { served: 0, missed: 0, satisfaction: 100 };
  private requestIn = 6;
  private route: Point[] = [];
  private lastPatrol = -1;
  private passengerRoutes = new Map<string, { points: Point[]; returning: boolean; settling: number }>();
  private assignment: { npcId: string; requestId: string; phase: 'fetch' | 'deliver' | 'serving'; wait: number } | null = null;

  private humanAssignment: { playerId: string; requestId: string; item: ServiceItem; phase: 'fetch' | 'deliver' | 'serving'; wait: number } | null = null;

  constructor() { this.reset(); }
  reset() {
    this.npcs.clear(); this.service = { served: 0, missed: 0, satisfaction: 100 };
    this.requestIn = 6; this.route = []; this.lastPatrol = -1; this.assignment = null; this.humanAssignment = null; this.passengerRoutes.clear();
    this.npcs.set(PILOT_NPC.id, { ...PILOT_NPC, kind: 'pilot', model: 'pilot', homeX: PILOT_NPC.x, homeZ: PILOT_NPC.z, needsSeat: false, alive: true, pose: 'seated', seat: 'Flight deck', request: null, carriedItem: null });
    for (const seat of NPC_PASSENGER_SEATS) this.npcs.set(seat.id, { id: seat.id, name: seat.name, kind: 'passenger', model: seat.model, x: seat.x, z: seat.z, yaw: 0, homeX: seat.x, homeZ: seat.z, needsSeat: false, alive: true, pose: 'seated', seat: seat.seat, request: null, carriedItem: null });
    this.npcs.set('attendant-1', { id: 'attendant-1', name: 'Avery · Cabin attendant', kind: 'attendant', model: 'attendant', x: 0.25, z: 6.3, yaw: 0, homeX: .25, homeZ: 6.3, needsSeat: false, alive: true, pose: 'idle', seat: null, request: null, carriedItem: null });
  }
  snapshot() { return [...this.npcs.values()].map(n => ({ ...n, request: n.request ? { ...n.request } : null })); }
  serviceSnapshot() { return { ...this.service }; }
  get(id: string) { return this.npcs.get(id); }
  servicePoint(id: string): Point | undefined {
    const seat = NPC_PASSENGER_SEATS.find(s => s.id === id);
    return seat ? { x: seat.serviceX, z: seat.serviceZ } : undefined;
  }
  serve(npcId: string, requestId: string, item: ServiceItem) {
    const npc = this.npcs.get(npcId);
    if (!npc?.alive || npc.needsSeat || npc.kind !== 'passenger' || npc.request?.id !== requestId || npc.request.item !== item) return false;
    npc.request = null; this.service.served++; this.service.satisfaction = Math.min(100, this.service.satisfaction + 2);
    if (this.assignment?.requestId === requestId) this.cancelAssignment();
    return true;
  }
  revive(npcId: string) {
    const npc = this.npcs.get(npcId); if (!npc) return false;
    npc.alive = true; npc.pose = npc.kind === 'attendant' ? 'idle' : 'seated'; npc.x = npc.homeX; npc.z = npc.homeZ; return true;
  }
  wrongOrder(npcId: string) {
    const npc = this.npcs.get(npcId), seat = NPC_PASSENGER_SEATS.find(s => s.id === npcId);
    if (!npc?.alive || !npc.request || !seat) return false;
    if (this.assignment?.npcId === npcId) this.cancelAssignment();
    npc.request = null; npc.needsSeat = true; npc.pose = 'standing';
    this.service.satisfaction = Math.max(0, this.service.satisfaction - 12);
    this.passengerRoutes.set(npc.id, { points: [{ x: npc.homeX, z: seat.serviceZ }, { x: Math.sign(npc.homeX) * .65, z: seat.serviceZ }], returning: false, settling: .8 });
    return true;
  }
  kill(npcId: string) {
    const npc = this.npcs.get(npcId);
    if (!npc?.alive) return false;
    this.passengerRoutes.delete(npcId); npc.needsSeat = false; npc.alive = false; npc.pose = 'dead'; npc.request = null; npc.carriedItem = null;
    if (npc.kind === 'attendant' || this.assignment?.npcId === npcId) this.cancelAssignment();
    return true;
  }
  /** Stand only aisle-side occupants; movement leaves their own seat before
   * entering the free aisle, and returns through the row's clear approach. */
  requestStanding(count = 1) {
    const available = NPC_PASSENGER_SEATS.filter(seat => Math.abs(seat.x) < 2.1)
      .map(seat => this.npcs.get(seat.id)!).filter(n => n.alive && !n.needsSeat && !this.passengerRoutes.has(n.id) && !n.request)
      .sort((a, b) => b.homeZ - a.homeZ);
    for (const npc of available.slice(0, count)) {
      const seat = NPC_PASSENGER_SEATS.find(s => s.id === npc.id)!;
      npc.needsSeat = true; npc.pose = 'standing';
      this.passengerRoutes.set(npc.id, { points: [{ x: npc.homeX, z: seat.serviceZ }, { x: Math.sign(npc.homeX) * .65, z: seat.serviceZ }], returning: false, settling: .8 });
    }
    return Math.min(count, available.length);
  }
  guideToSeat(id: string) {
    const npc = this.npcs.get(id), seat = NPC_PASSENGER_SEATS.find(s => s.id === id);
    if (!npc?.alive || !npc.needsSeat || !seat) return false;
    npc.needsSeat = false;
    this.passengerRoutes.set(id, { points: [{ x: npc.x, z: seat.serviceZ }, { x: npc.homeX, z: seat.serviceZ }, { x: npc.homeX, z: npc.homeZ }], returning: true, settling: 0 });
    return true;
  }
  allSeated() { return ![...this.npcs.values()].some(n => n.kind === 'passenger' && n.alive && (n.needsSeat || n.pose !== 'seated')); }
  private stepPassengers(dt: number) {
    for (const [id, route] of this.passengerRoutes) {
      const npc = this.npcs.get(id)!;
      if (!npc.alive) { this.passengerRoutes.delete(id); continue; }
      if (route.settling > 0) { route.settling -= dt; continue; }
      const target = route.points[0];
      if (!target) {
        if (route.returning && npc.pose !== 'sitting') { npc.pose = 'sitting'; route.settling = 1.25; }
        else if (route.returning) { npc.pose = 'seated'; npc.x = npc.homeX; npc.z = npc.homeZ; npc.yaw = 0; this.passengerRoutes.delete(id); }
        else { npc.pose = 'standing'; this.passengerRoutes.delete(id); }
        continue;
      }
      const dx = target.x - npc.x, dz = target.z - npc.z, distance = Math.hypot(dx, dz), step = Math.min(distance, dt * .8);
      if (distance < .002) { route.points.shift(); continue; }
      npc.pose = 'walking'; npc.x += dx / distance * step; npc.z += dz / distance * step; npc.yaw = Math.atan2(-dx, -dz);
      if (step === distance) route.points.shift();
    }
  }
  private cancelAssignment() {
    if (this.assignment) {
      const target = this.npcs.get(this.assignment.npcId);
      if (target?.request?.id === this.assignment.requestId) target.request.claimedBy = null;
    }
    this.assignment = null; this.route = [];
    const attendant = this.npcs.get('attendant-1'); if (attendant) { attendant.carriedItem = null; if (attendant.alive) attendant.pose = 'idle'; }
  }
  private setRoute(target: Point) {
    const attendant = this.npcs.get('attendant-1')!;
    // Use the clear central aisle between lateral approaches, never cut through seats.
    this.route = [{ x: 0, z: attendant.z }, { x: 0, z: target.z }, target];
  }
  private walk(dt: number) {
    const attendant = this.npcs.get('attendant-1')!;
    let distance = ATTENDANT_SPEED * dt;
    while (distance > 0 && this.route.length) {
      const target = this.route[0], dx = target.x - attendant.x, dz = target.z - attendant.z, length = Math.hypot(dx, dz);
      if (length < 0.002) { this.route.shift(); continue; }
      const step = Math.min(distance, length), x = attendant.x + dx / length * step, z = attendant.z + dz / length * step;
      if (!canStand(x, z)) { this.route = []; attendant.pose = 'idle'; return; }
      attendant.x = x; attendant.z = z; attendant.yaw = Math.atan2(-dx, -dz); attendant.pose = 'walking';
      distance -= step; if (step === length) this.route.shift();
    }
    if (!this.route.length) attendant.pose = 'idle';
  }
  /** Returns small integrity penalties for expired requests. */
  step(dt: number, humanService?: HumanServicePort) {
    let penalty = 0; this.stepPassengers(dt);
    for (const npc of this.npcs.values()) if (npc.request) {
      npc.request.remaining = Math.max(0, npc.request.remaining - dt);
      if (!npc.request.remaining) {
        if (this.assignment?.requestId === npc.request.id) this.cancelAssignment();
        npc.request = null; this.service.missed++; this.service.satisfaction = Math.max(0, this.service.satisfaction - 7); penalty += 2;
      }
    }
    this.requestIn -= dt;
    if (this.requestIn <= 0) {
      const passengers = [...this.npcs.values()].filter(n => n.kind === 'passenger' && n.alive);
      const available = passengers.filter(n => !n.request && !n.needsSeat && n.pose === 'seated');
      if (available.length && passengers.filter(n => n.request).length < 2) {
        const passenger = available[randomInt(available.length)];
        passenger.request = { id: randomUUID(), item: SERVICE_ITEMS[randomInt(SERVICE_ITEMS.length)], remaining: REQUEST_SECONDS, claimedBy: null };
        this.requestIn = 16;
      } else this.requestIn = 2;
    }
    const attendant = this.npcs.get('attendant-1')!;
    if (!attendant.alive) {
      if (this.humanAssignment) { humanService?.claim(this.humanAssignment.playerId, this.humanAssignment.requestId, null); this.humanAssignment = null; }
      return penalty;
    }
    // After the first 20 seconds for human crew, the same attendant physically
    // fetches and carries a player's order along the aisle to their live position.
    if (!this.assignment && !this.humanAssignment && humanService) {
      const next = humanService.targets.filter(target => target.request.remaining <= 70).sort((a, b) => a.request.remaining - b.request.remaining)[0];
      if (next) {
        this.humanAssignment = { playerId: next.id, requestId: next.request.id, item: next.request.item, phase: 'fetch', wait: 0 };
        humanService.claim(next.id, next.request.id, attendant.id); this.setRoute(AI_GALLEY_STOP);
      }
    }
    if (this.humanAssignment) {
      const assigned = this.humanAssignment, target = humanService?.targets.find(target => target.id === assigned.playerId && target.request.id === assigned.requestId);
      if (!target) { humanService?.claim(assigned.playerId, assigned.requestId, null); this.humanAssignment = null; this.route = []; attendant.carriedItem = null; attendant.pose = 'idle'; return penalty; }
      this.walk(dt);
      if (!this.route.length) {
        if (assigned.phase === 'fetch') {
          assigned.wait += dt;
          if (assigned.wait >= 1.5) { assigned.phase = 'deliver'; assigned.wait = 0; attendant.carriedItem = assigned.item; this.setRoute({ x: target.x, z: target.z }); }
        } else if (Math.hypot(attendant.x - target.x, attendant.z - target.z) >= 2.2) { assigned.phase = 'deliver'; assigned.wait = 0; this.setRoute({ x: target.x, z: target.z }); }
        else {
          assigned.phase = 'serving'; assigned.wait += dt; attendant.pose = 'serving'; attendant.yaw = Math.atan2(attendant.x - target.x, attendant.z - target.z);
          if (assigned.wait >= 2) { humanService!.deliver(assigned.playerId, assigned.requestId); this.humanAssignment = null; attendant.carriedItem = null; attendant.pose = 'idle'; }
        }
      }
      return penalty;
    }
    if (!this.assignment) {
      const next = [...this.npcs.values()].filter(n => n.alive && !n.needsSeat && n.pose === 'seated' && n.request && n.request.remaining <= REQUEST_SECONDS - HUMAN_SERVICE_PRIORITY_SECONDS)
        .sort((a, b) => a.request!.remaining - b.request!.remaining)[0];
      if (next?.request) {
        next.request.claimedBy = attendant.id;
        this.assignment = { npcId: next.id, requestId: next.request.id, phase: 'fetch', wait: 0 };
        this.setRoute(AI_GALLEY_STOP);
      }
    }
    if (this.assignment) {
      const assigned = this.assignment, npc = this.npcs.get(assigned.npcId);
      if (!npc?.alive || npc.request?.id !== assigned.requestId) { this.cancelAssignment(); return penalty; }
      this.walk(dt);
      if (!this.route.length) {
        if (assigned.phase === 'fetch') {
          assigned.wait += dt;
          if (assigned.wait >= 1.5) { assigned.phase = 'deliver'; assigned.wait = 0; attendant.carriedItem = npc.request.item; this.setRoute(this.servicePoint(npc.id)!); }
        } else if (assigned.phase === 'deliver') { assigned.phase = 'serving'; assigned.wait = 0; }
        else {
          attendant.pose = 'serving'; attendant.yaw = npc.x < 0 ? Math.PI / 2 : -Math.PI / 2; assigned.wait += dt;
          if (assigned.wait >= 2) this.serve(npc.id, assigned.requestId, npc.request.item);
        }
      }
    } else {
      if (!this.route.length) {
        const stops = [3, -6.5, 0, 6.5], choices = stops.map((_, index) => index).filter(index => index !== this.lastPatrol);
        this.lastPatrol = choices[randomInt(choices.length)]; this.setRoute({ x: 0.25, z: stops[this.lastPatrol] });
      }
      this.walk(dt);
    }
    return penalty;
  }
}
