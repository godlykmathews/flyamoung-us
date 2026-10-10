import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { input } from '../game/input';

export type HeldToolKind = 'knife' | 'rope' | 'bomb';
const FILES: Record<HeldToolKind, string> = { knife: 'knife', rope: 'rope', bomb: 'sabotage-case' };

/** The same authored prop is used for first-person hands and remote witnesses. */
export function ToolModel({ tool, held = false }: { tool: HeldToolKind; held?: boolean }) {
 const { scene } = useGLTF(`/models/journey/${FILES[tool]}.glb`, false, false);
 const object = useMemo(() => scene.clone(true), [scene]);
 return <group rotation={held&&tool==='knife'?[-Math.PI/2,0,0]:held&&tool==='rope'?[Math.PI/2,0,0]:[0,0,0]} position={held&&tool==='bomb'?[0,-.308,0]:held&&tool==='rope'?[0,-.1,0]:[0,0,0]}><primitive object={object} dispose={null}/></group>;
}

export function FirstPersonTool({ tool }: { tool: HeldToolKind | null }) {
 const group = useRef<Group>(null);
 const { camera } = useThree();
 const offset = useMemo(() => new Vector3(), []);
 const elapsed = useRef(0);
 const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(() => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => { reduced.current = media.matches; };
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
 }, []);
 useFrame((_, delta) => {
  if (!group.current) return;
  elapsed.current += Math.min(delta, .05);
  const bob = input.moving && !reduced.current ? Math.sin(elapsed.current * 7) * .006 : 0;
  offset.set(.32, -.38 + bob, -.62).applyQuaternion(camera.quaternion);
  group.current.position.copy(camera.position).add(offset);
  group.current.quaternion.copy(camera.quaternion);
 });
 if (!tool) return null;
 return <group ref={group}>
  <group rotation={[.1, -.25, .04]}>
   <Suspense fallback={null}><ToolModel tool={tool} held/></Suspense>
   <mesh position={[0,-.055,.04]} scale={[.042,.055,.073]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#bf9276" roughness={.8}/></mesh>
   <mesh position={[.022,-.11,.15]} rotation={[1.1,0,-.1]}><cylinderGeometry args={[.044,.058,.24,12]}/><meshStandardMaterial color="#344e62" roughness={.9}/></mesh>
  </group>
 </group>;
}

export function PlantedCase({ x, z }: { x:number; z:number }) {
 return <group position={[x,.02,z]}><Suspense fallback={null}><ToolModel tool="bomb"/></Suspense>
  <mesh position={[.12,.17,-.12]}><sphereGeometry args={[.016,8,8]}/><meshStandardMaterial color="#ff916e" emissive="#ff4b2c" emissiveIntensity={1.7}/></mesh>
 </group>;
}
