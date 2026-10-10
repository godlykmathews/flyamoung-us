import type { OperationsState, Player } from '../../../shared/protocol.js';

/** Arcade flight dynamics are authoritative and deliberately separate from the
 * cabin coordinates, role rules and scripted cruise chapters. Units: ft / kt / m.
 * This is a game controller, not a real aviation simulator. */
export class FlightOperations {
  private state!: OperationsState;
  private input: { id: string; at: number; pitch: number; roll: number } | null = null;
  constructor() { this.reset([]); }
  reset(ids: string[]) {
    this.input = null;
    this.state = { stage: 'boarding', elapsed: 0, altitude: 0, airspeed: 0, throttle: 0, pitch: 0, roll: 0, runwayProgress: 0, runwayOffset: 0, distance: 0, gearDown: true, brakes: true, operatorId: null, landingReady: false,
      roster: ids.map(playerId => ({ playerId, documentsReceived: false, boarded: false })), bomb: null, restraints: {}, crashReason: '', crashProgress: 0 };
  }
  snapshot(): OperationsState { return { ...this.state, roster: this.state.roster.map(p => ({ ...p })), bomb: this.state.bomb && { ...this.state.bomb }, restraints: { ...this.state.restraints } }; }
  get stage() { return this.state.stage; }
  get airborne() { return this.state.stage === 'cruise' || this.state.stage === 'landing' || this.state.stage === 'takeoff' && this.state.altitude > 5; }
  member(id: string) { return this.state.roster.find(p => p.playerId === id); }
  remove(id: string) { this.state.roster = this.state.roster.filter(p => p.playerId !== id); delete this.state.restraints[id]; this.releaseControl(id); }
  add(id: string) { if (!this.member(id)) this.state.roster.push({ playerId: id, documentsReceived: false, boarded: false }); }
  documents(id: string) { const member = this.member(id); if (this.stage !== 'boarding' || !member || member.boarded) return false; member.documentsReceived = true; return true; }
  board(id: string) { const member = this.member(id); if (this.stage !== 'boarding' || !member?.documentsReceived || member.boarded) return false; member.boarded = true; return true; }
  allBoarded(players: Player[]) { return players.filter(p => !p.detained).every(p => this.member(p.id)?.boarded); }
  canMove(id: string) { return !(this.state.restraints[id] > 0); }
  startTakeoff(id: string) {
    if (this.stage !== 'boarding') return false;
    Object.assign(this.state, { stage: 'takeoff', elapsed: 0, operatorId: id, brakes: true, throttle: 0 }); return true;
  }
  readyForLanding() { if (this.stage === 'cruise') this.state.landingReady = true; }
  startLanding(id: string) {
    if (this.stage !== 'cruise' || !this.state.landingReady) return false;
    this.input = null;
    Object.assign(this.state, { stage: 'landing', elapsed: 0, altitude: 900, airspeed: 165, throttle: .35, pitch: 0, roll: 0, runwayProgress: 0, runwayOffset: 0, distance: 0, gearDown: false, brakes: false, operatorId: id }); return true;
  }
  control(id: string, at: number, data: Record<string, unknown>) {
    if (this.stage !== 'takeoff' && this.stage !== 'landing') return false;
    if (this.input && this.input.id !== id && at - this.input.at < 500) return false;
    if (![data.throttle, data.pitch, data.roll].every(n => typeof n === 'number' && Number.isFinite(n)) || typeof data.gearDown !== 'boolean' || typeof data.brakes !== 'boolean') return false;
    this.state.throttle = Math.max(0, Math.min(1, data.throttle as number)); this.state.gearDown = data.gearDown; this.state.brakes = data.brakes;
    this.input = { id, at, pitch: Math.max(-1, Math.min(1, data.pitch as number)), roll: Math.max(-1, Math.min(1, data.roll as number)) };
    this.state.operatorId = id; return true;
  }
  releaseControl(id?: string) { if (!id || this.input?.id === id || this.state.operatorId === id) { this.input = null; this.state.operatorId = null; } }
  plantBomb(x: number, z: number) { if (this.state.bomb) return false; this.state.bomb = { x, z, remaining: 60, disarmProgress: 0 }; return true; }
  disarm(amount: number) { if (!this.state.bomb) return false; this.state.bomb.disarmProgress = Math.min(1, this.state.bomb.disarmProgress + amount); if (this.state.bomb.disarmProgress + 1e-6 < 1) return false; this.state.bomb = null; return true; }
  restrain(id: string) { this.state.restraints[id] = 20; }
  releaseRestraint(id: string) { delete this.state.restraints[id]; }
  crash(reason: string) { if (this.stage === 'crashed' || this.stage === 'arrived') return; this.input = null; Object.assign(this.state, { stage: 'crashed', elapsed: 0, operatorId: null, crashReason: reason, crashProgress: 0 }); }
  /** Legacy cruise-focused unit fixtures may replace this private state. The
   * production class exposes no transition that bypasses boarding or takeoff. */
  step(dt: number, now: number, validPilot: (id: string) => boolean, reservePilot = false) {
    const s = this.state; s.elapsed += dt;
    if (s.stage === 'crashed') { s.crashProgress = Math.min(1, s.elapsed / 8); s.altitude = Math.max(0, s.altitude - dt * Math.max(80, s.altitude / 2)); return; }
    if (s.stage === 'arrived') return;
    for (const id of Object.keys(s.restraints)) { s.restraints[id] = Math.max(0, s.restraints[id] - dt); if (!s.restraints[id]) delete s.restraints[id]; }
    if (s.bomb) { s.bomb.remaining = Math.max(0, s.bomb.remaining - dt); if (s.bomb.remaining <= 0) { this.crash('A device detonated and the aircraft went down over the ocean.'); return; } }
    if (s.stage !== 'takeoff' && s.stage !== 'landing') return;
    if (this.input && (now - this.input.at > 500 || !validPilot(this.input.id))) this.releaseControl();
    if (reservePilot) {
      const landing = s.stage === 'landing';
      this.input = { id: 'npc-reserve-pilot', at: now, pitch: landing ? (s.altitude > 0 ? -.12 : 0) : .42, roll: -s.runwayOffset * .4 };
      s.operatorId = 'npc-reserve-pilot'; s.throttle = landing ? (s.altitude > 0 ? .32 : 0) : 1; s.brakes = landing && s.altitude === 0; s.gearDown = landing || s.altitude < 40;
    }
    const commandedPitch = this.input?.pitch ?? 0, commandedRoll = this.input?.roll ?? 0;
    s.pitch += (commandedPitch - s.pitch) * Math.min(1, dt * 3); s.roll += (commandedRoll - s.roll) * Math.min(1, dt * 3);
    s.runwayOffset = Math.max(-2, Math.min(2, s.runwayOffset + s.roll * dt * .18));
    if (s.stage === 'takeoff') {
      const drag = s.brakes && s.altitude <= 0 ? 18 : 1.4;
      s.airspeed = Math.max(0, Math.min(230, s.airspeed + (s.throttle * 10 - drag) * dt));
      s.distance += s.airspeed * .51444 * dt; s.runwayProgress = Math.min(1, s.distance / 2600);
      if (s.airspeed >= 135 && s.pitch > .15 && Math.abs(s.roll) < .5) s.altitude += s.airspeed * s.pitch * 2.2 * dt;
      else if (s.altitude > 0) s.altitude = Math.max(0, s.altitude + (s.pitch * 80 - 12) * dt);
      if (s.altitude < 5 && (s.runwayProgress >= 1 || Math.abs(s.runwayOffset) > 1)) { this.crash('The aircraft left the coastal runway before a safe takeoff.'); return; }
      if (s.altitude > 5 && !s.gearDown && s.airspeed < 105) { this.crash('The aircraft lost lift over the ocean.'); return; }
      if (s.altitude >= 600 && !s.gearDown) { Object.assign(s, { stage: 'cruise', elapsed: 0, altitude: 34000, airspeed: 465, pitch: 0, roll: 0, operatorId: null, runwayProgress: 1 }); this.input = null; }
    } else {
      const targetSpeed = 95 + s.throttle * 130;
      s.airspeed += (targetSpeed - s.airspeed) * dt * .18;
      s.distance += s.airspeed * .51444 * dt; s.runwayProgress = Math.min(1, s.distance / 4000);
      if (s.altitude > 0) {
        s.altitude = Math.max(0, s.altitude + (-16 + s.pitch * 65) * dt);
        if (s.altitude === 0 && (!s.gearDown || s.airspeed < 100 || s.airspeed > 155 || Math.abs(s.roll) > .3 || Math.abs(s.runwayOffset) > .45 || Math.abs(s.pitch) > .55)) { this.crash('The approach was unstable and the aircraft went down near the coastal runway.'); return; }
      } else {
        // Rollout needs a deliberate idle throttle and brake input.
        s.airspeed = Math.max(0, s.airspeed - (s.brakes ? 24 : 4) * dt - (s.throttle < .1 ? 12 : 0) * dt);
        if (s.airspeed < 20 && s.brakes && s.throttle < .1) { Object.assign(s, { stage: 'arrived', elapsed: 0, airspeed: 0, operatorId: null }); this.input = null; }
      }
      if (s.elapsed > 120 && s.stage === 'landing') this.crash('The flight missed its safe landing window over the ocean.');
    }
  }
}
