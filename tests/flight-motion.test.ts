import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightMotion } from '../client/src/scene/flightMotion.js';
import { FlightOperations } from '../server/src/systems/operations.js';
import type { OperationsState } from '../shared/protocol.js';

const op = (changes: Partial<OperationsState> = {}): OperationsState => ({ ...new FlightOperations().snapshot(), stage: 'takeoff', ...changes });
const near = (value: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} differs from ${expected}`);

function runwaySamples(seconds: number) {
 const flight = new FlightOperations(); flight.startTakeoff('pilot');
 const points = [flight.snapshot()];
 for (let tick = 1; tick <= Math.round(seconds / .05); tick++) {
  flight.control('pilot', tick * 50, { throttle: 1, pitch: 0, roll: .05, gearDown: true, brakes: false });
  flight.step(.05, tick * 50, () => true);
  if (tick % 2 === 0) points.push(flight.snapshot());
 }
 return points;
}

test('real 20 Hz flight samples render continuous runway motion at 30, 60 and 144 FPS', () => {
 const points = runwaySamples(5), finals: number[] = [];
 for (const fps of [30, 60, 144]) {
  const motion = new FlightMotion(); let next = 0, moved = 0, measured = 0, previous = 0;
  for (let frame = 0; frame <= fps * 5; frame++) {
   const now = frame / fps;
   while (next < points.length && points[next].elapsed <= now + 1e-8) { motion.ingest(points[next], 'room', now, true); next++; }
   const rendered = motion.sample(now), latest = points[next - 1];
   assert.ok(rendered.distance >= previous, 'a snapshot must not kick scenery backwards');
   if (now > 1) { measured++; if (rendered.distance > previous + 1e-5) moved++; }
   assert.ok(Math.abs(rendered.distance - latest.distance) <= latest.airspeed * .51444 * .3 + .02, 'motion remains close to authoritative distance');
   previous = rendered.distance;
  }
  assert.ok(moved / measured > .95, `${fps} FPS should move on render frames, not only 10 Hz arrivals`);
  finals.push(previous);
 }
 assert.ok(Math.max(...finals) - Math.min(...finals) < .4, 'frame rates preserve the same flight progress');
});

test('altitude, attitude and alignment interpolate between shared samples', () => {
 const motion = new FlightMotion();
 motion.ingest(op({ elapsed: 10, distance: 100, altitude: 20, pitch: .1, roll: -.2, runwayOffset: .2, airspeed: 140 }), 'room', 0, true);
 motion.sample(0);
 motion.ingest(op({ elapsed: 10.1, distance: 110, altitude: 40, pitch: .3, roll: .2, runwayOffset: .4, airspeed: 150 }), 'room', .1, true);
 motion.sample(.1);
 const halfway = motion.sample(.15);
 near(halfway.distance, 105); near(halfway.altitude, 30); near(halfway.pitch, .2); near(halfway.roll, 0); near(halfway.runwayOffset, .3); near(halfway.airspeed, 145);
});

test('jittered deliveries keep advancing between arrivals and delayed corrections never rewind distance', () => {
 const points = runwaySamples(4), motion = new FlightMotion();
 let next = 0, previous = 0, moved = 0;
 for (let frame = 0; frame <= 60 * 4; frame++) {
  const now = frame / 60;
  while (next < points.length && points[next].elapsed + [0, .04, .08, .02][next % 4] <= now + 1e-8) { motion.ingest(points[next], 'room', now, true); next++; }
  const rendered = motion.sample(now);
  assert.ok(rendered.distance >= previous);
  if (now > 1 && rendered.distance > previous + 1e-5) moved++;
  previous = rendered.distance;
 }
 assert.ok(moved > 165, 'jitter does not collapse motion to snapshot cadence');
 const correction = new FlightMotion();
 correction.ingest(op({ elapsed: 0, distance: 0 }), 'room', 0, true);
 correction.ingest(op({ elapsed: .1, distance: 5 }), 'room', .1, true);
 let ahead = correction.sample(.1);
 for (let frame = 1; frame <= 20; frame++) ahead = correction.sample(.1 + frame / 60);
 correction.ingest(op({ elapsed: .2, distance: 7 }), 'room', .45, true);
 assert.ok(correction.sample(.45).distance >= ahead.distance);
});

test('packet stalls stop bounded prediction instead of flying indefinitely', () => {
 const motion = new FlightMotion();
 motion.ingest(op({ elapsed: 0, distance: 0 }), 'room', 0, true);
 motion.ingest(op({ elapsed: .1, distance: 5 }), 'room', .1, true);
 let rendered = motion.sample(.1);
 for (let frame = 1; frame <= 120; frame++) rendered = motion.sample(.1 + frame / 60);
 assert.ok(rendered.elapsed <= .25 + 1e-6); assert.ok(rendered.distance <= 12.5 + 1e-6);
 assert.deepEqual(motion.sample(3), rendered, 'scenery stops after the extrapolation horizon');
});

test('stage cuts, new rooms and elapsed rollback reset the presentation track', () => {
 const motion = new FlightMotion();
 motion.ingest(op({ elapsed: 20, distance: 900, altitude: 300 }), 'room', 0, true); motion.sample(.1);
 motion.ingest(op({ stage: 'landing', elapsed: 0, distance: 0, altitude: 900 }), 'room', .2, true);
 assert.equal(motion.sample(.2).distance, 0); assert.equal(motion.sample(.2).altitude, 900);
 motion.ingest(op({ stage: 'landing', elapsed: 10, distance: 400 }), 'other-room', .3, true);
 assert.equal(motion.sample(.3).distance, 400);
 motion.ingest(op({ stage: 'landing', elapsed: 0, distance: 0 }), 'other-room', .4, true);
 assert.equal(motion.sample(.4).distance, 0); assert.equal(motion.sample(.4).elapsed, 0);
});

test('meetings freeze motion and resume without consuming the paused wall time', () => {
 const motion = new FlightMotion();
 motion.ingest(op({ elapsed: 10, distance: 100 }), 'room', 0, true); motion.sample(.05);
 motion.ingest(op({ elapsed: 10.1, distance: 105 }), 'room', .1, true);
 const before = motion.sample(.1);
 motion.ingest(op({ elapsed: 10.1, distance: 105 }), 'room', .11, false);
 assert.deepEqual(motion.sample(90), before);
 motion.ingest(op({ elapsed: 10.1, distance: 105 }), 'room', 90, true);
 assert.deepEqual(motion.sample(90), before);
 const resumed = motion.sample(90.05);
 assert.ok(resumed.distance > before.distance); assert.ok(resumed.elapsed - before.elapsed <= .075 + 1e-6);
});

test('tab resume caps each render-clock delta and never mutates authoritative snapshots', () => {
 const motion = new FlightMotion(), first = op({ elapsed: 10, distance: 100 }), next = op({ elapsed: 10.1, distance: 105 });
 const saved = structuredClone(next);
 motion.ingest(first, 'room', 0, true); motion.sample(0);
 motion.ingest(next, 'room', .1, true); const before = motion.sample(.1), resumed = motion.sample(120);
 assert.ok(resumed.elapsed - before.elapsed <= .1 + 1e-6);
 assert.ok(resumed.distance - before.distance <= 5 + 1e-6);
 const sameClock = motion.sample(120); assert.deepEqual(sameClock, resumed);
 // A fresh server sample can arrive before the resumed frame. Catch-up still
 // cannot turn the long absence into a large presentation-clock jump.
 motion.ingest(op({ elapsed: 12, distance: 200 }), 'room', 240, true);
 const caughtUp = motion.sample(240);
 assert.ok(caughtUp.elapsed - resumed.elapsed <= .1 + 1e-6);
 assert.deepEqual(next, saved);
});

test('many snapshots arriving in a hidden tab retain the render anchor for bounded resume', () => {
 const motion = new FlightMotion();
 motion.ingest(op({ elapsed: 10, distance: 500, altitude: 100, airspeed: 97 }), 'room', 0, true);
 const before = motion.sample(0);
 // The WebSocket continues receiving while requestAnimationFrame is paused.
 // This exceeds the bounded sample window and previously discarded the point
 // near the cursor, making the resumed scene jump almost two seconds ahead.
 for (let tick = 1; tick <= 30; tick++) motion.ingest(op({ elapsed: 10 + tick * .1, distance: 500 + tick * 5, altitude: 100 + tick * 2, airspeed: 97 }), 'room', tick * .1, true);
 const resumed = motion.sample(3);
 assert.ok(resumed.elapsed - before.elapsed <= .1 + 1e-6);
 assert.ok(resumed.distance - before.distance <= 5 + 1e-6);
 assert.ok(resumed.altitude - before.altitude <= 2 + 1e-6);
 let previous = resumed;
 for (let frame = 1; frame <= 60; frame++) {
  const rendered = motion.sample(3 + frame / 60);
  assert.ok(rendered.distance >= previous.distance);
  assert.ok(rendered.distance - previous.distance <= 1.25 + 1e-6, 'catch-up remains continuous at 60 FPS');
  previous = rendered;
 }
 assert.ok(previous.distance > resumed.distance + 20, 'the retained anchor allows forward recovery');
});
