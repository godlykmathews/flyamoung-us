import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, InstancedMesh, MathUtils, Object3D, Vector3 } from 'three';
import { FlightModel } from './FlightModel';
import { FlightEnvironment } from './FlightEnvironment';

export const EMERGENCY_DESCENT_DURATION_MS = 9_000;

function EngineTrail({ reducedMotion }: { reducedMotion: boolean }) {
  const particles = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);
  const transform = useMemo(() => new Object3D(), []);
  useFrame((_, delta) => {
    if (!particles.current) return;
    if (!reducedMotion) elapsed.current += Math.min(delta, .1);
    for (let i = 0; i < 22; i++) {
      const age = (i / 22 + elapsed.current * .17) % 1;
      const spread = .16 + age * .75;
      transform.position.set(4.1 + Math.sin(i * 2.71) * spread, -1.15 + age * .3 + Math.cos(i * 1.4) * spread * .3, 1.8 + age * 15);
      transform.rotation.set(i, i * .3, i * .7);
      const size = (.24 + age * 1.1) * Math.sin(age * Math.PI) ** .3;
      transform.scale.set(size, size * .6, size * 1.3); transform.updateMatrix();
      particles.current.setMatrixAt(i, transform.matrix);
    }
    particles.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={particles} args={[undefined, undefined, 22]} frustumCulled={false} renderOrder={3}>
    <sphereGeometry args={[1, 12, 8]} />
    <shaderMaterial transparent depthWrite={false}
      vertexShader={`varying vec3 viewNormal;varying vec3 viewPosition;
        void main(){vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);viewPosition=mv.xyz;viewNormal=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);gl_Position=projectionMatrix*mv;}`}
      fragmentShader={`varying vec3 viewNormal;varying vec3 viewPosition;
        void main(){float edge=abs(dot(normalize(viewNormal),normalize(-viewPosition)));float alpha=smoothstep(.03,.75,edge)*.11;gl_FragColor=vec4(.34,.37,.40,alpha);}`}
    />
  </instancedMesh>;
}

/** A nine-second fictional emergency outcome, ending above the cloud deck.
 * There is no impact sequence. The server's outcome is already final; this
 * presentation never changes integrity, location, or the multiplayer state.
 * Canvas camera: fov 45, near .1, far 6000; this component owns its position.
 */
export function EmergencyDescent({ onComplete }: { onComplete: () => void }) {
  const aircraft = useRef<Group>(null), start = useRef<number | null>(null), complete = useRef(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const callback = useRef(onComplete); callback.current = onComplete;
  const { camera, size } = useThree();
  const lookAt = useMemo(() => new Vector3(), []);
  const framing = Math.max(1, .95 / (size.width / size.height));
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useFrame(() => {
    if (!aircraft.current) return;
    const now = performance.now();
    if (start.current === null) start.current = now;
    const t = MathUtils.clamp((now - start.current) / EMERGENCY_DESCENT_DURATION_MS, 0, 1);
    const progress = t * t * (3 - 2 * t);
    const movement = reduced ? progress * .12 : progress;
    aircraft.current.position.set(-movement * 8, 10 - movement * 20, -movement * 48);
    aircraft.current.rotation.set(reduced ? -.025 : -.055 - progress * .065, -.03 * movement, reduced ? .055 : .13 + Math.sin(progress * Math.PI * .8) * .13);
    const { x, y, z } = aircraft.current.position;
    // Smooth tracking, without a camera roll, cut, shake, or sudden zoom.
    camera.position.set(x + (36 + movement * 5) * framing, y + (13 + movement * 4) * framing, z + (-29 + movement * 11) * framing);
    lookAt.set(x, y - .15, z); camera.lookAt(lookAt);
    if (t >= 1 && !complete.current) { complete.current = true; callback.current(); }
  });
  return <>
    <FlightEnvironment moving={!reduced} />
    <fog attach="fog" args={['#bdcdda', 190, 1800]} />
    <ambientLight intensity={.52} />
    <hemisphereLight args={['#d8e6f1', '#70818b', 1.4]} />
    <directionalLight position={[-85, 100, -90]} intensity={2.1} color="#eee9dc" />
    <group ref={aircraft}>
      <FlightModel />
      <EngineTrail reducedMotion={reduced} />
    </group>
  </>;
}
