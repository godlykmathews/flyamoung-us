import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { BackSide, Color, DynamicDrawUsage, Group, InstancedMesh, Object3D, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import { FlightModel } from './FlightModel';

const SKY_VERTEX = `
 varying vec3 vWorldPosition;
 void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
 }
`;
const SKY_FRAGMENT = `
 varying vec3 vWorldPosition;
 void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);
  float height = smoothstep(-0.3, 0.85, direction.y);
  vec3 horizon = vec3(0.90, 0.94, 0.95);
  vec3 zenith = vec3(0.47, 0.72, 0.84);
  vec3 sky = mix(horizon, zenith, height);
  float light = pow(max(dot(direction, normalize(vec3(-0.65, 0.5, -0.5))), 0.0), 6.0);
  sky = mix(sky, vec3(1.0, 0.97, 0.89), light * 0.24);
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }
`;

/** A small set of overlapping density slices gives the landing page depth without
 * starting the terrain, weather, or cabin simulation. All textures are local. */
function BoardingClouds({ reducedMotion }: { reducedMotion: boolean }) {
 const texture = useTexture('/textures/cumulus-density.png');
 texture.colorSpace = SRGBColorSpace;
 const mesh = useRef<InstancedMesh>(null);
 const transform = useMemo(() => new Object3D(), []);
 const elapsed = useRef(0);
 const puffs = useMemo(() => {
  let seed = 9404;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return [
   { x: -35, y: -16, z: 12, scale: 1.1 },
   { x: 5, y: -21, z: 32, scale: 1.4 },
   { x: 42, y: -18, z: 18, scale: 1.05 },
   { x: -15, y: -15, z: 65, scale: 1.7 },
  ].flatMap((bank, bankIndex) => Array.from({ length: 12 }, () => ({
   position: new Vector3(bank.x + (random() - .5) * 27 * bank.scale, bank.y + random() * 5, bank.z + (random() - .5) * 15),
   world: new Vector3(),
   size: (10 + random() * 13) * bank.scale,
   color: new Color().setScalar(.96 + random() * .04),
   speed: .16 + bankIndex * .035,
   distance: 0,
  })));
 }, []);
 useFrame(({ camera }, delta) => {
  if (!mesh.current) return;
  if (!reducedMotion) elapsed.current += Math.min(delta, .05);
  for (const puff of puffs) {
   puff.world.copy(puff.position);
   puff.world.x += Math.sin(elapsed.current * .024) * 9 * puff.speed;
   puff.distance = puff.world.distanceToSquared(camera.position);
  }
  puffs.sort((a, b) => b.distance - a.distance);
  puffs.forEach((puff, i) => {
   transform.position.copy(puff.world);
   transform.quaternion.copy(camera.quaternion);
   transform.scale.set(puff.size, puff.size, 1);
   transform.updateMatrix();
   mesh.current!.setMatrixAt(i, transform.matrix);
   mesh.current!.setColorAt(i, puff.color);
  });
  mesh.current.instanceMatrix.needsUpdate = true;
  if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
 });
 return <instancedMesh ref={mesh} args={[undefined, undefined, puffs.length]} frustumCulled={false}
  onUpdate={object => object.instanceMatrix.setUsage(DynamicDrawUsage)}>
  <planeGeometry args={[1, 1]}/>
  <meshBasicMaterial map={texture} transparent opacity={.7} depthWrite={false} fog={false}/>
 </instancedMesh>;
}

/** A calm companion-aircraft portrait. Framing reserves room for the boarding
 * form on desktop and centers the aircraft in the separate mobile hero. */
export function BoardingScene() {
 const aircraft = useRef<Group>(null);
 const elapsed = useRef(0);
 const { camera, size } = useThree();
 const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => setReducedMotion(query.matches);
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
 }, []);
 useEffect(() => {
  if (!(camera instanceof PerspectiveCamera)) return;
  const mobile = size.width < 760;
  const aspect = size.width / size.height;
  const framing = mobile ? Math.max(1, 1.16 / aspect) : Math.max(1, 1.7 / aspect);
  camera.fov = mobile ? 38 : 35;
  camera.position.set(-29 * framing, 10.4 * framing, -34 * framing);
  camera.lookAt(0, .2, 0);
  camera.setViewOffset(size.width, size.height, mobile ? 0 : -size.width * .205, mobile ? 0 : -size.height * .045, size.width, size.height);
  camera.updateProjectionMatrix();
  return () => { camera.clearViewOffset(); };
 }, [camera, size.width, size.height]);
 useFrame((_, delta) => {
  if (!aircraft.current) return;
  if (!reducedMotion) elapsed.current += Math.min(delta, .05);
  const time = elapsed.current;
  aircraft.current.position.y = reducedMotion ? .15 : .15 + Math.sin(time * .3) * .18;
  aircraft.current.rotation.set(.025, -.08, reducedMotion ? -.035 : -.035 + Math.sin(time * .2) * .009);
 });
 return <>
  <color attach="background" args={['#d7e8ef']}/>
  <mesh scale={600}>
   <sphereGeometry args={[1, 24, 16]}/>
   <shaderMaterial vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} side={BackSide} depthWrite={false}/>
  </mesh>
  <ambientLight intensity={.5}/>
  <hemisphereLight args={['#f0f8ff', '#7395a1', 1.8]}/>
  <directionalLight position={[-25, 55, -35]} intensity={3.1} color="#fffaf0" castShadow
   shadow-mapSize={[1024, 1024]} shadow-camera-near={1} shadow-camera-far={120}
   shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20}
   shadow-normalBias={.025}/>
  <directionalLight position={[25, 15, 20]} intensity={.75} color="#d2e9f7"/>
  <Suspense fallback={null}><BoardingClouds reducedMotion={reducedMotion}/></Suspense>
  <group ref={aircraft}><FlightModel/></group>
 </>;
}
