import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { FlightModel } from './FlightModel';
import { FlightEnvironment } from './FlightEnvironment';
import { DEPARTURE_DURATION_MS } from '../game/departure';

/** The aircraft moves in presentation space; crew coordinates stay on the server. */
export function DepartureScene({ onComplete }: { onComplete: () => void }) {
 const aircraft = useRef<Group>(null);
 const start = useRef<number | null>(null);
 const finished = useRef(false);
 const [loaded, setLoaded] = useState(false);
 const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const ready = useCallback(() => setLoaded(true), []);
 const { camera, size } = useThree();
 const lookAt = useMemo(() => new Vector3(), []);
 const framing = Math.max(1, .95 / (size.width / size.height));
 useFrame(() => {
  if (!aircraft.current) return;
  const now = performance.now();
  if (loaded && start.current === null) start.current = now;
  const t = start.current === null ? 0 : Math.min(1, (now - start.current) / DEPARTURE_DURATION_MS);
  const progress = t * t * (3 - 2 * t);
  const motion = reducedMotion ? .35 : progress;
  // Restrained cruise attitude: a two-degree bank and a gentle nose-up pitch.
  aircraft.current.position.set(Math.sin(motion * Math.PI) * .6, 1.8 + motion * .4, -motion * 15);
  aircraft.current.rotation.set(.012, 0, -.018 - Math.sin(motion * Math.PI) * .017);
  const { x, y, z } = aircraft.current.position;
  // A steady companion-aircraft shot, never circling behind or under the wings.
  camera.position.set(x + (32 + motion * 7) * framing, y + (11 + motion * 2) * framing, z + (-27 + motion * 18) * framing);
  lookAt.set(x, y + .4, z);
  camera.lookAt(lookAt);
  if (t >= 1 && !finished.current) { finished.current = true; onComplete(); }
 });
 return <>
  <FlightEnvironment moving={loaded && !reducedMotion}/>
  <fog attach="fog" args={['#d5e4ee', 250, 2200]}/>
  <ambientLight intensity={.45}/>
  <hemisphereLight args={['#ecf5ff', '#738a9c', 1.6]}/>
  <directionalLight position={[-85, 100, -90]} intensity={2.6} color="#fff8ec" castShadow
   shadow-mapSize={[2048, 2048]} shadow-camera-near={1} shadow-camera-far={250}
   shadow-camera-left={-38} shadow-camera-right={38} shadow-camera-top={35} shadow-camera-bottom={-35}
   shadow-bias={-.0002} shadow-normalBias={.02}/>
  <group ref={aircraft}><FlightModel onReady={ready}/></group>
 </>;
}
