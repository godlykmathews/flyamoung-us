import type { OperationsState } from '../../../shared/protocol';

export type FlightMotionSample = Pick<OperationsState, 'elapsed' | 'distance' | 'altitude' | 'airspeed' | 'pitch' | 'roll' | 'runwayOffset'>;

const DELAY = .1;
const MAX_EXTRAPOLATION = .15;
const MAX_FRAME_DELTA = .1;
const FIELDS = ['distance', 'altitude', 'airspeed', 'pitch', 'roll', 'runwayOffset'] as const;
const emptySample = (): FlightMotionSample => ({ elapsed: 0, distance: 0, altitude: 0, airspeed: 0, pitch: 0, roll: 0, runwayOffset: 0 });
const copySample = (op: FlightMotionSample): FlightMotionSample => ({ elapsed: op.elapsed, distance: op.distance, altitude: op.altitude, airspeed: op.airspeed, pitch: op.pitch, roll: op.roll, runwayOffset: op.runwayOffset });

/** Presentation only: the server still owns flight progress and every outcome.
 * A short delayed clock joins 10 Hz snapshots into continuous frame motion.
 * Brief packet gaps use bounded velocity prediction, then stop at the horizon.
 */
export class FlightMotion {
 private points: FlightMotionSample[] = [];
 private roomId = '';
 private stage: OperationsState['stage'] | null = null;
 private cursor = 0;
 private lastClock = 0;
 private playing = false;
 private lastResult = emptySample();

 ingest(op: OperationsState, roomId: string, nowSeconds: number, playing: boolean) {
  const latest = this.points.at(-1);
  if (!latest || roomId !== this.roomId || op.stage !== this.stage || op.elapsed < latest.elapsed - 1e-6) {
   this.roomId = roomId; this.stage = op.stage;
   this.points = [copySample(op)]; this.cursor = op.elapsed - DELAY;
   this.lastResult = copySample(op); this.lastClock = nowSeconds; this.playing = playing;
   return;
  }
  // Pausing/resuming never consumes the wall time spent in a meeting.
  if (playing !== this.playing) this.lastClock = nowSeconds;
  this.playing = playing;
  if (Math.abs(op.elapsed - latest.elapsed) < 1e-6) this.points[this.points.length - 1] = copySample(op);
  else {
   this.points.push(copySample(op));
   // Keep the point immediately before the render cursor. A hidden tab may
   // receive many snapshots without rendering; discarding this anchor would
   // snap the next frame to the oldest retained sample despite the delta cap.
   while (this.points.length > 2 && this.points[1].elapsed <= this.cursor) this.points.shift();
   if (this.points.length > 12) this.points.splice(1, this.points.length - 12);
  }
 }

 sample(nowSeconds: number): FlightMotionSample {
  const latest = this.points.at(-1);
  if (!latest) return emptySample();
  const dt = Math.min(MAX_FRAME_DELTA, Math.max(0, nowSeconds - this.lastClock));
  this.lastClock = nowSeconds;
  if (!this.playing) return { ...this.lastResult };
  // Recover gradual lag after a delayed packet without jumping or rewinding.
  const catchup = Math.min(Math.max(0, latest.elapsed - DELAY - (this.cursor + dt)), dt * .5);
  this.cursor = Math.min(this.cursor + Math.min(MAX_FRAME_DELTA, dt + catchup), latest.elapsed + MAX_EXTRAPOLATION);
  let before = this.points[0], after = latest;
  if (this.cursor <= before.elapsed) after = before;
  else {
   for (let index = 1; index < this.points.length; index++) {
    after = this.points[index];
    if (after.elapsed >= this.cursor) break;
    before = after;
   }
   if (this.cursor > latest.elapsed && this.points.length > 1) before = this.points[this.points.length - 2];
  }
  const span = after.elapsed - before.elapsed;
  const amount = span > 1e-6 ? Math.max(0, (this.cursor - before.elapsed) / span) : 0;
  const result = copySample(before);
  for (const field of FIELDS) result[field] = before[field] + (after[field] - before[field]) * amount;
  result.elapsed = Math.max(this.lastResult.elapsed, before.elapsed, this.cursor);
  // Corrected velocity predictions may briefly be ahead of a later sample;
  // hold that distance until the authoritative track catches up, never kick back.
  result.distance = Math.max(this.lastResult.distance, result.distance, 0);
  result.altitude = Math.max(0, result.altitude); result.airspeed = Math.max(0, result.airspeed);
  result.pitch = Math.max(-1, Math.min(1, result.pitch)); result.roll = Math.max(-1, Math.min(1, result.roll));
  result.runwayOffset = Math.max(-2, Math.min(2, result.runwayOffset));
  this.lastResult = result;
  return { ...result };
 }
}
