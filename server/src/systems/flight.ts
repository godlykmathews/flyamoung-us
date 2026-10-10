import type { FlightState } from '../../../shared/protocol.js';

/** A flight controller operates outside the cabin's local coordinate space.
 * Replace this port with a server-authoritative physics controller when manual
 * flight is implemented; walking/networking need no world-coordinate changes. */
export interface FlightController {
  readonly mode: FlightState['mode'];
  reset(): void;
  step(seconds: number, routeDuration: number): void;
  snapshot(): FlightState;
}
export class AutopilotController implements FlightController {
  readonly mode = 'autopilot' as const;
  private elapsed = 0;
  private progress = 0;
  reset() { this.elapsed = 0; this.progress = 0; }
  step(seconds: number, routeDuration: number) {
    this.elapsed += seconds;
    this.progress = Math.min(1, this.elapsed / routeDuration);
  }
  snapshot(): FlightState {
    return { mode: this.mode, altitude: 34000, airspeed: 465, heading: 274, progress: this.progress };
  }
}
