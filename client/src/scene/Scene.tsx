import { Suspense, Component, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Float } from '@react-three/drei';
import { Aircraft } from './Aircraft';
import { FlightModel } from './FlightModel';
import { EmergencyDescent } from './EmergencyDescent';
import { DepartureScene } from './DepartureScene';
import { Controls } from './Controls';
import { CrewAvatar } from './CrewAvatar';
import { CabinReflections } from './CabinReflections';
import { CabinNpcs } from './CabinNpcs';
import { FlightEnvironment } from './FlightEnvironment';
import { SafetyPresentationCamera, SafetyStationSign } from './SafetyPresentation';
import { IncidentEffects, IncidentHorizon } from './IncidentEffects';
import { session } from '../network/session';
import type { Snapshot } from '../../../shared/protocol';
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}> {
 state={error:false};static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<div className="webgl-error">3D rendering is unavailable. Enable hardware acceleration and reload in a desktop browser.</div>:this.props.children;}
}
export function Scene({snapshot,enabled,departing,emergencyDescent,onEmergencyComplete,onDepartureComplete,onNearby,onArea,onLock}:{snapshot:Snapshot|null;enabled:boolean;departing:boolean;emergencyDescent:boolean;onEmergencyComplete:()=>void;onDepartureComplete:()=>void;onNearby:(id:string|null)=>void;onArea:(area:string)=>void;onLock:(locked:boolean)=>void}) {
 const blackout=snapshot?.sabotage==='blackout';
 const storm=snapshot?.story.turbulence.active;
 const pressure=snapshot?.experience.incident==='decompression';
 const presenting=snapshot?.safety.status==='demonstrating'&&snapshot.safety.operatorId===session.id();
 if(emergencyDescent)return <SceneBoundary><Canvas key="emergency-descent" camera={{position:[36,23,-29],fov:45,near:.1,far:6000}} dpr={[1,1.5]} shadows gl={{antialias:true,powerPreference:'high-performance'}}><EmergencyDescent onComplete={onEmergencyComplete}/></Canvas></SceneBoundary>;
 if(departing)return <SceneBoundary><Canvas camera={{position:[31,10.5,-30],fov:45,near:.1,far:6000}} dpr={[1,1.5]} shadows gl={{antialias:true,powerPreference:'high-performance'}}><DepartureScene onComplete={onDepartureComplete}/></Canvas></SceneBoundary>;
 return <SceneBoundary><Canvas key={snapshot?'cabin':'exterior'} camera={snapshot?{position:[0,1.68,8],fov:76,near:.05,far:6000}:{position:[19,12,-29],fov:38}} dpr={[1,1.5]} shadows gl={{antialias:true,powerPreference:'high-performance'}}>
 <color attach="background" args={[snapshot?'#b8d5df':'#e8eef2']}/><fog attach="fog" args={[snapshot?'#b8d5df':'#e8eef2',snapshot?250:38,snapshot?2200:100]}/>
 <ambientLight intensity={blackout?.08:snapshot?.55:1.1}/><hemisphereLight args={[snapshot?(storm?'#bccbd9':'#e4f2ff'):'#d7f2ff',snapshot?'#536778':'#a39a81',blackout?.13:snapshot?1.1:1.5]}/><directionalLight position={[8,15,5]} intensity={blackout?.05:snapshot?(storm?.55:1):3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-normalBias={.025}/>
 {snapshot&&<><IncidentHorizon snapshot={snapshot}><FlightEnvironment moving={snapshot.phase==='playing'}/></IncidentHorizon><CabinReflections blackout={blackout}/></>}
 {snapshot&&[-11,-5,2,10,16].map(z=><pointLight key={z} position={[0,2.8,z]} color='#fff4df' intensity={blackout?0:7} distance={11} decay={2}/>)}
 <Suspense fallback={null}>{snapshot?<><Aircraft blackout={blackout} completedTasks={snapshot.tasks.filter(t=>t.completed).map(t=>t.id)}/><IncidentEffects snapshot={snapshot}/><Suspense fallback={null}><CabinNpcs npcs={snapshot.npcs} experience={snapshot.experience} turbulence={!!storm||pressure}/></Suspense>{snapshot.players.filter(p=>p.id!==session.id()||presenting).map(p=><CrewAvatar key={p.id} player={p} safety={snapshot.safety.operatorId===p.id&&snapshot.safety.status==='demonstrating'?snapshot.safety:undefined}/>)}<SafetyStationSign complete={snapshot.safety.status==='complete'}/><Controls cameraOverride={presenting} turbulence={storm?Math.max(.25,Math.abs(snapshot.story.turbulence.roll)):pressure?.22:0} enabled={enabled} onNearby={onNearby} onArea={onArea} onLock={onLock}/>{presenting&&<SafetyPresentationCamera safety={snapshot.safety}/>}</>:<><Float speed={.7} rotationIntensity={.08} floatIntensity={.3}><group position={[1,1,0]} rotation={[0,-.3,-.04]} scale={.78}><FlightModel/></group></Float><ContactShadows position={[0,-3.3,0]} opacity={.25} scale={60} blur={3} far={15} resolution={256}/><gridHelper args={[160,32,'#c4d0db','#dbe3e9']} position={[0,-3.4,0]}/></>}</Suspense>
 </Canvas></SceneBoundary>;
}
