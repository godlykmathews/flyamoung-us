import { Suspense, useRef, Component, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Float, Html } from '@react-three/drei';
import { Group, MathUtils } from 'three';
import { Aircraft, ExteriorAircraft } from './Aircraft';
import { Controls } from './Controls';
import { session } from '../network/session';
import type { Player, Snapshot } from '../../../shared/protocol';
function Avatar({player}:{player:Player}) {
 const ref=useRef<Group>(null);const first=useRef(true);const walk=useRef(0);
 useFrame((_,dt)=>{const group=ref.current;if(!group)return;const target=session.get().snapshot?.players.find(p=>p.id===player.id);if(!target)return;if(first.current){group.position.set(target.x,0,target.z);first.current=false;}const distance=Math.hypot(target.x-group.position.x,target.z-group.position.z);walk.current+=dt*9;group.position.x=MathUtils.damp(group.position.x,target.x,14,dt);group.position.z=MathUtils.damp(group.position.z,target.z,14,dt);group.position.y=distance>.03?Math.sin(walk.current)*.035:0;group.rotation.y=target.yaw;});
 return <group ref={ref}><mesh position={[0,1.05,0]}><capsuleGeometry args={[.23,.55,4,10]}/><meshStandardMaterial color={player.detained?'#64716e':player.color}/></mesh><mesh position={[0,1.65,0]}><sphereGeometry args={[.21,16,12]}/><meshStandardMaterial color="#d4ac89"/></mesh><mesh position={[0,1.73,0]}><sphereGeometry args={[.217,16,8,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#263b3b"/></mesh>{[-.13,.13].map(x=><mesh key={x} position={[x,.34,0]}><capsuleGeometry args={[.085,.48,4,8]}/><meshStandardMaterial color="#263b3b"/></mesh>)}<mesh position={[0,1.12,-.235]}><boxGeometry args={[.11,.16,.015]}/><meshStandardMaterial color="#fff6d9"/></mesh><Html center position={[0,2.1,0]} distanceFactor={7} occlude><div className="avatar-label">{player.name}<small>{player.detained?'DETAINED':player.role}</small></div></Html></group>;
}
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}> {
 state={error:false};static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<div className="webgl-error">3D rendering is unavailable. Enable hardware acceleration and reload in a desktop browser.</div>:this.props.children;}
}
export function Scene({snapshot,enabled,onNearby,onArea,onLock}:{snapshot:Snapshot|null;enabled:boolean;onNearby:(id:string|null)=>void;onArea:(area:string)=>void;onLock:(locked:boolean)=>void}) {
 const blackout=snapshot?.sabotage==='blackout';
 return <SceneBoundary><Canvas key={snapshot?'cabin':'exterior'} camera={snapshot?{position:[0,1.68,8],fov:76,near:.05,far:150}:{position:[17,10,22],fov:36}} dpr={[1,1.5]} shadows gl={{antialias:true,powerPreference:'high-performance'}}>
 <color attach="background" args={[snapshot?'#b8d5df':'#dbe5df']}/><fog attach="fog" args={[snapshot?'#b8d5df':'#dbe5df',snapshot?35:38,100]}/>
 <ambientLight intensity={blackout?.1:snapshot?.8:1.1}/><hemisphereLight args={['#d7f2ff','#a39a81',blackout?.15:1.5]}/><directionalLight position={[8,15,5]} intensity={snapshot?1:3} castShadow shadow-mapSize={[1024,1024]}/>
 <Suspense fallback={null}>{snapshot?<><Aircraft blackout={blackout} completedTasks={snapshot.tasks.filter(t=>t.completed).map(t=>t.id)}/>{snapshot.players.filter(p=>p.id!==session.id()).map(p=><Avatar key={p.id} player={p}/>)}<Controls enabled={enabled} onNearby={onNearby} onArea={onArea} onLock={onLock}/></>:<><Float speed={.7} rotationIntensity={.08} floatIntensity={.3}><group position={[1,1,0]} rotation={[0,-.3,-.04]}><ExteriorAircraft/></group></Float><ContactShadows position={[0,-3.3,0]} opacity={.25} scale={60} blur={3} far={15} resolution={256}/><gridHelper args={[160,32,'#bac9c1','#cedad3']} position={[0,-3.4,0]}/></>}</Suspense>
 </Canvas></SceneBoundary>;
}
