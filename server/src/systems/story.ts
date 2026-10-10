import type { JourneyObjective, JourneyStage, JourneyState, Role, WorldActionKind } from '../../../shared/protocol.js';
import { TASKS } from '../../../shared/world.js';

const TEXT: Record<JourneyStage, [string, string]> = {
  departure: ['Departure checks', 'Complete your assigned departure checks. Cabin Crew present the safety demonstration, secure the trolley and seat passengers.'],
  service: ['Cruise service', 'Complete your role’s cruise checks while Cabin Crew deliver passenger requests from the aft galley.'],
  turbulence: ['Turbulence ahead', 'Cabin Crew seat passengers, the Engineer secures equipment, and the Captain holds the aircraft level.'],
  approach: ['Prepare for landing', 'Complete your assigned arrival checks. Cabin Crew inspect the forward cabin once everyone is seated.'],
};
const objective = (id: string, label: string, role: Role, target: number): JourneyObjective => ({ id, label, role, current: 0, target });

/** Journey objectives use gameplay events, never client-supplied completion flags.
 * Flight balance is a separate controller, ready to be replaced with flight physics.
 */
export class JourneySimulation {
  private state!: JourneyState;
  private control: { roll: number; pitch: number; at: number; id: string } | null = null;
  private roles = new Set<Role>();
  private completedTasks = new Set<string>();
  constructor(private training: boolean) { this.reset(); }
  reset(roles: Role[] = []) { this.control = null; this.roles = new Set(roles); this.completedTasks.clear(); this.enter('departure'); }
  private enter(stage: JourneyStage) {
    const [title, instruction] = TEXT[stage];
    const objectives = stage === 'departure' ? [objective('secure-cart', 'Latch the service trolley', 'Cabin Crew', 1), objective('guide-passenger', 'Guide a passenger to their seat', 'Cabin Crew', 1), objective('safety-demo', 'Present the safety demonstration', 'Cabin Crew', 1)]
      : stage === 'service' ? [objective('serve-passenger', 'Deliver passenger requests', 'Cabin Crew', this.training ? 1 : 2)]
      : stage === 'turbulence' ? [objective('guide-passenger', 'Seat passengers during turbulence', 'Cabin Crew', 2), objective('secure-equipment', 'Latch emergency equipment', 'Engineer', 1), objective('stabilize-flight', 'Keep the aircraft level', 'Captain', 10)]
      : [objective('cabin-check', 'Complete the forward cabin inspection', 'Cabin Crew', 1)];
    if (!this.training) for (const task of TASKS) {
      if (task.stage !== stage || !this.roles.has(task.role)) continue;
      const check = objective(`task:${task.id}`, task.name, task.role, 1);
      check.current = this.completedTasks.has(task.id) ? 1 : 0; objectives.push(check);
    }
    this.state = { stage, title, instruction, elapsed: 0, seatbeltSign: stage !== 'service', objectives,
      turbulence: { active: stage === 'turbulence', roll: stage === 'turbulence' ? .62 : 0, pitch: stage === 'turbulence' ? -.46 : 0, stability: 0, required: 10, operatorId: null } };
  }
  snapshot(): JourneyState { return { ...this.state, objectives: this.state.objectives.map(o => ({ ...o })), turbulence: { ...this.state.turbulence } }; }
  get stage() { return this.state.stage; }
  get ready() { return this.state.objectives.every(o => o.current >= o.target); }
  needed(id: string) { return this.state.objectives.some(o => o.id === id && o.current < o.target); }
  credit(id: string, amount = 1) { const goal = this.state.objectives.find(o => o.id === id); if (goal) goal.current = Math.min(goal.target, goal.current + amount); }
  completeTask(id: string) { this.completedTasks.add(id); this.credit(`task:${id}`); }
  /** Reserve coverage is granted by FlightGame only after a publicly unavailable
   * human role has been absent for the bounded grace period. */
  coverRole(role: Role, canCover: (id: string) => boolean = () => true) {
    const covered: string[] = [];
    for (const goal of this.state.objectives) {
      if (goal.role !== role || goal.current >= goal.target || !canCover(goal.id)) continue;
      goal.current = goal.target; covered.push(goal.id);
      if (goal.id.startsWith('task:')) this.completedTasks.add(goal.id.slice(5));
    }
    return covered;
  }
  coverFlight() {
    const flight = this.state.turbulence;
    if (!flight.active || flight.stability >= flight.required) return false;
    this.stopControl(); flight.roll = 0; flight.pitch = 0; flight.stability = flight.required;
    this.credit('stabilize-flight', flight.required);
    if (this.state.stage !== 'turbulence') flight.active = false;
    return true;
  }
  allows(kind: WorldActionKind) { return this.needed(kind) || kind === 'guide-passenger'; }
  beginWeatherDrill() {
    if (this.state.turbulence.active) return;
    this.control = null; this.state.turbulence = { active: true, roll: .62, pitch: -.46, stability: 0, required: 10, operatorId: null };
  }
  setControl(id: string, roll: number, pitch: number, at: number) {
    if (!this.state.turbulence.active || this.state.turbulence.stability >= this.state.turbulence.required) return false;
    if (this.control && this.control.id !== id && at - this.control.at <= 300) return false;
    this.control = { id, roll: Math.max(-1, Math.min(1, roll)), pitch: Math.max(-1, Math.min(1, pitch)), at };
    return true;
  }
  stopControl(id?: string) { if (!id || this.control?.id === id) { this.control = null; this.state.turbulence.operatorId = null; } }
  /** Returns a newly entered stage; callers announce it and schedule cabin events. */
  advance(): JourneyStage | null {
    if (!this.ready || this.state.stage === 'approach') return null;
    const next = this.state.stage === 'departure' ? 'service' : this.state.stage === 'service' ? 'turbulence' : 'approach';
    this.control = null; this.enter(next); return next;
  }
  step(dt: number, now: number, operatorValid: (id: string) => boolean) {
    this.state.elapsed += dt;
    const flight = this.state.turbulence;
    if (!flight.active) return;
    if (this.control && (now - this.control.at > 300 || !operatorValid(this.control.id))) this.control = null;
    flight.operatorId = this.control?.id ?? null;
    if (flight.stability >= flight.required) { flight.roll *= Math.exp(-dt * 3); flight.pitch *= Math.exp(-dt * 3); if (this.state.stage !== 'turbulence') flight.active = false; return; }
    // Normalized attitude. Positive controls increase their axis; pilots apply
    // opposite input to return the marker to center. Fresh active input is required.
    const t = this.state.elapsed;
    flight.roll = Math.max(-1, Math.min(1, flight.roll + (.075 + Math.sin(t * .83) * .16 + (this.control?.roll ?? 0) * .85) * dt));
    flight.pitch = Math.max(-1, Math.min(1, flight.pitch + (-.055 + Math.cos(t * .67) * .13 + (this.control?.pitch ?? 0) * .75) * dt));
    const centered = Math.abs(flight.roll) < .23 && Math.abs(flight.pitch) < .23;
    flight.stability = Math.max(0, Math.min(flight.required, flight.stability + (this.control && centered ? dt : -dt * .3)));
    const goal = this.state.objectives.find(o => o.id === 'stabilize-flight'); if (goal) goal.current = flight.stability;
  }
}
