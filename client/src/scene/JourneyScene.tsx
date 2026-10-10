import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Mesh, Vector3 } from 'three';
import type { Player, Snapshot } from '../../../shared/protocol';
import { session } from '../network/session';
import { FlightModel } from './FlightModel';
import { AuthoredCharacterModel } from './CharacterModel';
import { FlightAtmosphere } from './FlightEnvironment';

// Supplied Boeing bounds: 10.978793m high / 34.294657m long.
// FlightModel centres those bounds and normalizes the length to 24m.
const AIRCRAFT_GROUND_Y = 3.74;

/** Every airport prop is an original Blender model exported in metres. */
export function JourneyAsset({ name, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: {
 name: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number;
}) {
 const { scene } = useGLTF(`/models/journey/${name}.glb`, false, false);
 const model = useMemo(() => { const clone = scene.clone(true); clone.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } }); return clone; }, [scene]);
 return <group position={position} rotation={rotation} scale={scale}><primitive object={model} dispose={null}/></group>;
}

function TerminalCamera({ snapshot, meId, enabled }: { snapshot: Snapshot; meId: string; enabled: boolean }) {
 const { camera, gl } = useThree();
 const keys = useRef(new Set<string>()), yaw = useRef(0), pitch = useRef(0), drag = useRef(false), timer = useRef(0), initialized = useRef(false);
 const point = useMemo(() => new Vector3(), []);
 const walkingEnabled = enabled && snapshot.phase === 'playing';
 useEffect(() => { initialized.current = false; }, [snapshot.phase]);
 useEffect(() => {
  const canvas = gl.domElement;
  const stop = () => { keys.current.clear(); drag.current = false; session.send('move', { dx: 0, dz: 0, yaw: yaw.current }); };
  const down = (event: KeyboardEvent) => { if (!walkingEnabled || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) { keys.current.add(event.code); event.preventDefault(); } };
  const up = (event: KeyboardEvent) => keys.current.delete(event.code);
  const mouse = (event: MouseEvent) => { if (walkingEnabled && drag.current) { yaw.current -= event.movementX * .003; pitch.current = MathUtils.clamp(pitch.current - event.movementY * .002, -.6, .6); } };
  const start = (event: MouseEvent) => { if (walkingEnabled && event.button === 2) { drag.current = true; canvas.focus(); } };
  const release = () => { drag.current = false; };
  const context = (event: MouseEvent) => event.preventDefault();
  canvas.tabIndex = 0;
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop); window.addEventListener('mousemove', mouse); window.addEventListener('mouseup', release); canvas.addEventListener('mousedown', start); canvas.addEventListener('contextmenu', context);
  return () => { stop(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); window.removeEventListener('mousemove', mouse); window.removeEventListener('mouseup', release); canvas.removeEventListener('mousedown', start); canvas.removeEventListener('contextmenu', context); };
 }, [gl, walkingEnabled]);
 useFrame((_, dt) => {
  if (snapshot.phase === 'lobby') { camera.position.set(0, 1.68, 13); camera.lookAt(-1.1, 1.6, 5.5); return; }
  const me = snapshot.players.find(player => player.id === meId); if (!me) return;
  if (!initialized.current) { yaw.current = me.yaw; camera.position.set(me.x, 1.68, me.z); initialized.current = true; }
  const k = keys.current, delta = Math.min(dt, .1);
  yaw.current += ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) * delta * 1.4;
  pitch.current = MathUtils.clamp(pitch.current + ((k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)) * delta, -.6, .6);
  const forward = enabled ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0, sideways = enabled ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
  timer.current += delta;
  if (timer.current >= .05) { timer.current = 0; session.send('move', { dx: -Math.sin(yaw.current) * forward + Math.cos(yaw.current) * sideways, dz: -Math.cos(yaw.current) * forward - Math.sin(yaw.current) * sideways, yaw: yaw.current }); }
  point.set(me.x, 1.68, me.z); camera.position.lerp(point, 1 - Math.exp(-15 * delta)); camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
 });
 return null;
}

function GroundPlane() {
 return <>
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.14, 0]} receiveShadow><planeGeometry args={[2400, 2400]}/><meshStandardMaterial color="#89a092" roughness={1}/></mesh>
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.13, -40]} receiveShadow><planeGeometry args={[210, 150]}/><meshStandardMaterial color="#a9b0ac" roughness={.96}/></mesh>
  {[-54, -34, -14, 6, 26, 46].map(x => <mesh key={x} position={[x, -.12, -43]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.14, 115]}/><meshBasicMaterial color="#e3d0a0"/></mesh>)}
 </>;
}

function Concourse() {
 return <group>
  <mesh position={[0, -.12, 10]} receiveShadow><boxGeometry args={[28, .22, 16]}/><meshStandardMaterial color="#e4e6e0" roughness={.35}/></mesh>
  <mesh position={[0, 5.4, 10]} receiveShadow><boxGeometry args={[28, .25, 16]}/><meshStandardMaterial color="#f4f3eb" roughness={.6}/></mesh>
  <mesh position={[0, 2.7, 18]}><boxGeometry args={[28, 5.5, .18]}/><meshStandardMaterial color="#e2e5df"/></mesh>
  {[-12, -9, -6, -3, 3, 6, 9, 12].map(x => <group key={x} position={[x, 0, 2.05]}>
   <mesh position={[0, 2.7, 0]}><boxGeometry args={[2.88, 5.1, .03]}/><meshPhysicalMaterial color="#bedce2" transparent opacity={.17} roughness={.12} depthWrite={false}/></mesh>
   <mesh position={[1.48, 2.7, 0]} castShadow><boxGeometry args={[.12, 5.4, .18]}/><meshStandardMaterial color="#9aaeb2" metalness={.6} roughness={.35}/></mesh>
   <mesh position={[0, .24, 0]}><boxGeometry args={[3, .12, .18]}/><meshStandardMaterial color="#a8b8ba" metalness={.5} roughness={.4}/></mesh>
  </group>)}
  {[-10, -5, 0, 5, 10].map(x => <group key={x}>
   <mesh position={[x, 5.24, 10]}><boxGeometry args={[.07, .03, 13]}/><meshStandardMaterial color="#fff1cf" emissive="#fff0ce" emissiveIntensity={1.1}/></mesh>
   <mesh position={[x, -.001, 10]}><boxGeometry args={[.01, .002, 16]}/><meshStandardMaterial color="#cbd1c9"/></mesh>
  </group>)}
  {[-9, -6.8, 6.5, 9].map(x => <group key={x} position={[x, 0, 7.2]}>
   <mesh position={[0, .43, .06]} castShadow><boxGeometry args={[.66, .11, .6]}/><meshStandardMaterial color="#315464" roughness={.8}/></mesh>
   <mesh position={[0, .84, .33]} rotation={[-.1, 0, 0]} castShadow><boxGeometry args={[.66, .78, .09]}/><meshStandardMaterial color="#315464" roughness={.8}/></mesh>
   {[-.24, .24].map(side => <mesh key={side} position={[side, .2, .08]}><boxGeometry args={[.055, .42, .45]}/><meshStandardMaterial color="#9aa8a8" metalness={.65} roughness={.4}/></mesh>)}
  </group>)}
 </group>;
}

function TerminalTraveller({ index, elapsed }: { index: number; elapsed: number }) {
 const group = useRef<Group>(null);
 useFrame(() => {
  if (!group.current) return;
  const t = MathUtils.clamp((elapsed - index * 3 - 1) / 13, 0, 1);
  group.current.visible = t > 0 && t < 1;
  const approach = MathUtils.smoothstep(t, 0, .42);
  group.current.position.set((4.4 - index * .4) * (1 - approach), 0, 12 - t * 17);
  group.current.rotation.y = t < .42 ? .54 : 0;
 });
 return <group ref={group} visible={false}><AuthoredCharacterModel model={`passenger-${['a', 'b', 'c'][index % 3]}`} pose="walking"/><JourneyAsset name="suitcase" position={[.55, 0, .23]} rotation={[.13, 0, 0]}/></group>;
}

function TerminalPeer({ player }: { player: Player }) {
 const group = useRef<Group>(null), movement = useRef(0), point = useMemo(() => new Vector3(), []);
 useFrame((_, dt) => {
  if (!group.current) return;
  point.set(player.x, 0, player.z);
  movement.current = Math.min(1, group.current.position.distanceTo(point) * 4);
  group.current.position.lerp(point, 1 - Math.exp(-16 * Math.min(.1, dt)));
  const difference = MathUtils.euclideanModulo(player.yaw - group.current.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  group.current.rotation.y += difference * (1 - Math.exp(-16 * Math.min(.1, dt)));
 });
 return <group ref={group} position={[player.x, 0, player.z]} rotation={[0, player.yaw, 0]}><AuthoredCharacterModel model={player.model === 'crew-man' ? 'passenger-b' : player.model} movement={movement}/></group>;
}

function Terminal({ snapshot, meId, enabled }: { snapshot: Snapshot; meId: string; enabled: boolean }) {
 return <>
  <GroundPlane/><Concourse/>
  <Suspense fallback={null}>
   <JourneyAsset name="airport-terminal" position={[48, 0, -23]} rotation={[0, -.4, 0]}/>
   <JourneyAsset name="gate-desk" position={[-2.4, 0, 9.4]}/>
   <JourneyAsset name="crew-documents" position={[-1.65, 1.18, 9.4]}/><JourneyAsset name="passport" position={[-2.2, 1.18, 9.52]}/>
   <JourneyAsset name="boarding-scanner" position={[.8, 0, 5.4]}/>
   <JourneyAsset name="jetbridge" position={[0, 0, 1]}/><JourneyAsset name="jetbridge" position={[0, 0, -7]}/>
   <group position={[-2.4, 0, 8.5]} rotation={[0, Math.PI, 0]}><AuthoredCharacterModel model="attendant" pose="gesture"/></group>
   {snapshot.players.filter(player => player.id !== meId && !snapshot.operations.roster.find(entry => entry.playerId === player.id)?.boarded).map((player, index) => <TerminalPeer key={player.id} player={snapshot.phase === 'lobby' ? { ...player, x: -3.5 + index % 4 * 2.2, z: 11.3 + Math.floor(index / 4) * .85, yaw: 0 } : player}/>)}
   {snapshot.phase === 'playing' && [0, 1, 2].map(index => <TerminalTraveller key={index} index={index} elapsed={snapshot.operations.elapsed}/>)}
   {[-9, -6.8, 6.5, 9].map((x, index) => <group key={x} position={[x, 0, 7.2]}><AuthoredCharacterModel model={`passenger-${['a', 'b', 'c'][index % 3]}`} pose="seated"/><JourneyAsset name="suitcase" position={[.65, 0, .4]} rotation={[0, -.4, 0]}/></group>)}
   <group position={[8, 3.71, -12.5]} rotation={[0, Math.PI / 2, 0]}><FlightModel gearDown/></group>
  </Suspense>
  <TerminalCamera snapshot={snapshot} meId={meId} enabled={enabled}/>
 </>;
}

function Runway({ travel, landing }: { travel: number; landing: boolean }) {
 // Repeat fixed runway details around the vehicle, while movement comes from
 // server distance. The modulo is only scenery; it never advances the flight.
 const offset = ((travel * .18) % 36 + 36) % 36;
 return <group position={[0, -.1, 0]}>
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[30, 2200]}/><meshStandardMaterial color="#515d62" roughness={.94}/></mesh>
  {[-1, 1].map(side => <mesh key={side} position={[side * 13.8, .015, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.22, 2200]}/><meshBasicMaterial color="#e5e7df"/></mesh>)}
  {Array.from({ length: 25 }, (_, i) => <group key={i} position={[0, .025, (i - 17) * 36 + offset]}>
   <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.5, 13]}/><meshBasicMaterial color="#fff7db"/></mesh>
   <Suspense fallback={null}><JourneyAsset name="runway-lights" scale={1.6}/></Suspense>
  </group>)}
 </group>;
}

function Sea({ crashed }: { crashed: boolean }) {
 const uniforms = useMemo(() => ({ time: { value: 0 } }), []);
 useFrame((_, dt) => { uniforms.time.value += Math.min(dt, .1); });
 return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.4, 0]} receiveShadow><planeGeometry args={[9000, 9000]}/><shaderMaterial uniforms={uniforms} vertexShader={`varying vec3 p;void main(){p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`uniform float time;varying vec3 p;void main(){float waves=sin(p.x*.31+time*.65)*sin(p.z*.17-time*.44);float farWaves=sin(p.x*.08+p.z*.13+time*.3);vec3 water=mix(vec3(.045,.24,.32),vec3(.19,.45,.49),waves*.12+farWaves*.09+.3);float sparkle=pow(max(0.,sin(p.x*1.1+time)*sin(p.z*.8-time*.6)),24.)*.13;float haze=1.-exp(-length(p-cameraPosition)*.0008);gl_FragColor=vec4(mix(water+sparkle,vec3(.63,.77,.8),haze),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`}/></mesh>;
}

function OceanImpact({ elapsed }: { elapsed: number }) {
 const impact = MathUtils.clamp((elapsed - 7.1) / 2.7, 0, 1);
 if (impact <= 0 || impact >= 1) return null;
 return <group position={[0, -.12, 0]}>
  {[0, 1, 2].map(index => <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} scale={[1, .56, 1]} position={[0, index * .015, 0]}>
   <ringGeometry args={[3 + impact * (18 + index * 3), 4 + impact * (20 + index * 3), 64]}/><meshBasicMaterial color="#ecf6f4" transparent opacity={(1 - impact) * .48} depthWrite={false}/>
  </mesh>)}
  {Array.from({ length: 10 }, (_, index) => { const angle = index * Math.PI * .2; return <mesh key={index} position={[Math.cos(angle) * impact * 9, Math.sin(impact * Math.PI) * (1 + index % 3) * 1.8, Math.sin(angle) * impact * 6]} scale={[.8 + impact, (1 - impact) * 2.6, .8 + impact]}><sphereGeometry args={[1, 9, 6]}/><meshStandardMaterial color="#e7f4f1" transparent opacity={(1 - impact) * .35} depthWrite={false}/></mesh>; })}
 </group>;
}

// The server owns velocity, altitude, attitude, stage and touchdown. The client
// only smooths those samples and frames the shared aircraft for every player.
function AircraftJourney({ snapshot }: { snapshot: Snapshot }) {
 const aircraft = useRef<Group>(null); const { camera, size } = useThree();
 const look = useMemo(() => new Vector3(), []), cameraTarget = useMemo(() => new Vector3(), []);
 const op = snapshot.operations;
 const crash = op.stage === 'crashed';
 useFrame((_, delta) => {
  if (!aircraft.current) return;
  const dt = Math.min(delta, .1), framing = Math.max(1, 1.2 / (size.width / size.height));
  const y = crash ? Math.max(-4, 20 * (1 - op.elapsed / 8)) : AIRCRAFT_GROUND_Y + op.altitude * .055;
  aircraft.current.position.y = MathUtils.damp(aircraft.current.position.y, y, 5, dt);
  aircraft.current.position.x = MathUtils.damp(aircraft.current.position.x, op.runwayOffset * 14, 4, dt);
  aircraft.current.rotation.x = MathUtils.damp(aircraft.current.rotation.x, crash ? -.24 : op.pitch * .32, 5, dt);
  aircraft.current.rotation.z = MathUtils.damp(aircraft.current.rotation.z, crash ? .25 : -op.roll * .44, 5, dt);
  const p = aircraft.current.position;
  cameraTarget.set(p.x + 31 * framing, p.y + 12 * framing, 33 * framing); camera.position.lerp(cameraTarget, 1 - Math.exp(-3 * dt));
  look.set(p.x, p.y + 1.8, -13); camera.lookAt(look);
 });
 return <>
  {crash ? <><Sea crashed/><OceanImpact elapsed={op.elapsed}/></> : <><GroundPlane/><Runway travel={op.distance} landing={op.stage === 'landing' || op.stage === 'arrived'}/></>}
  <group ref={aircraft} position={[0, crash ? 20 : AIRCRAFT_GROUND_Y + op.altitude * .055, 0]}><FlightModel gearDown={op.gearDown}/></group>
 </>;
}

/** Content for the existing scene root Canvas, not a nested canvas. */
export function JourneyScene({ snapshot, meId, enabled = true }: { snapshot: Snapshot; meId: string; enabled?: boolean }) {
 const terminal = snapshot.phase === 'lobby' || snapshot.operations.stage === 'boarding';
 return <>
  <FlightAtmosphere/><fog attach="fog" args={['#c6d8dd', 160, 1600]}/>
  <ambientLight intensity={.45}/><hemisphereLight args={['#e6f2fa', '#8a988b', 1.35]}/>
  <directionalLight position={[-35, 65, 20]} intensity={2.3} color="#fff6e5" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-normalBias={.02}/>
  {terminal ? <Terminal snapshot={snapshot} meId={meId} enabled={enabled}/> : <AircraftJourney snapshot={snapshot}/>}
 </>;
}

export function isJourneyExterior(snapshot: Snapshot, meId: string) {
 return snapshot.phase === 'lobby' || snapshot.operations.stage === 'boarding' && !snapshot.operations.roster.find(entry => entry.playerId === meId)?.boarded || ['takeoff', 'landing', 'crashed', 'arrived'].includes(snapshot.operations.stage);
}
