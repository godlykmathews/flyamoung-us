import { Suspense, Fragment, Component, useEffect, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { Aircraft } from './Aircraft';
import { BoardingScene } from './BoardingScene';
import { JourneyScene, JourneyAsset, preloadGateAssets } from './JourneyScene';
import { sceneMode, type SceneMode } from '../game/sceneMode';
import { FirstPersonTool, PlantedCase } from './HeldTool';
import { EmergencyDescent } from './EmergencyDescent';
import { DepartureScene } from './DepartureScene';
import { Controls } from './Controls';
import { CrewAvatar } from './CrewAvatar';
import { CabinReflections } from './CabinReflections';
import { CabinNpcs } from './CabinNpcs';
import { FlightEnvironment, FlightAtmosphere } from './FlightEnvironment';
import { SafetyPresentationCamera, SafetyStationSign } from './SafetyPresentation';
import { IncidentEffects, IncidentHorizon } from './IncidentEffects';
import { session } from '../network/session';
import { TASKS } from '../../../shared/tasks';
import { canDoTask } from '../../../shared/duties';
import type { Snapshot } from '../../../shared/protocol';
const CAMERA = {position:[0,1.68,12] as [number,number,number],fov:58,near:.1,far:10000};
const DPR: [number,number] = [1,1.5];
const RENDERER = {antialias:true,powerPreference:'high-performance' as const};

/** Reset the lens once per view, while preserving the renderer and shared GLB buffers. */
function SceneCamera({mode}:{mode:SceneMode}) {
 const {camera}=useThree();
 // Passive setup runs after the departing safety camera restores its old lens.
 useEffect(()=>{
  if('fov' in camera) camera.fov=mode==='cabin'?76:mode==='intro'?35:mode==='gate'?58:45;
  camera.near=mode==='cabin'?.05:.1;camera.far=mode==='intro'?6000:10000;
  if('clearViewOffset' in camera) camera.clearViewOffset();
  camera.position.set(...(mode==='cabin'?[0,1.68,8]:mode==='gate'?[0,1.68,13]:[31,10.5,33]) as [number,number,number]);
  camera.rotation.set(0,0,0);camera.updateProjectionMatrix();
 },[camera,mode]);
 return null;
}
class SceneBoundary extends Component<{children:ReactNode;view:SceneMode},{error:Error|null}> {
 state:{error:Error|null}={error:null};
 static getDerivedStateFromError(error:Error){return {error};}
 componentDidCatch(error:Error){console.error('FLIGHT 404 scene failed:',error);}
 componentDidUpdate(previous:{view:SceneMode}){if(this.state.error&&previous.view!==this.props.view)this.setState({error:null});}
 render(){return this.state.error?<div className="webgl-error" role="alert"><span>The 3D scene stopped unexpectedly.</span><button className="secondary" onClick={()=>this.setState({error:null})}>Reload scene</button></div>:this.props.children;}
}
function DutyMarkers({snapshot}:{snapshot:Snapshot}) {
 const me=snapshot.players.find(player=>player.id===session.id());
 if(snapshot.phase!=='playing'||!me||me.detained)return null;
 const repairId=snapshot.sabotage?{blackout:'electrical',comms:'radio',navigation:'navigation'}[snapshot.sabotage]:null;
 return <group>{TASKS.filter(task=>canDoTask(me.role,task.id,snapshot.training)
  && (task.id===repairId||!snapshot.tasks.some(state=>state.id===task.id&&state.completed))).map(task=><Billboard key={task.id} position={[task.x,2.02,task.z]}>
   <mesh><ringGeometry args={[.044,.057,20]}/><meshBasicMaterial color={task.id===repairId?'#edb466':'#45aca8'} toneMapped={false}/></mesh>
   <mesh position={[0,0,-.003]}><circleGeometry args={[.031,12]}/><meshBasicMaterial color="#e9fbf4" toneMapped={false}/></mesh>
  </Billboard>)}</group>;
}
export function Scene({snapshot,enabled,departing,emergencyDescent,onEmergencyComplete,onDepartureComplete,onNearby,onArea,onLock}:{snapshot:Snapshot|null;enabled:boolean;departing:boolean;emergencyDescent:boolean;onEmergencyComplete:()=>void;onDepartureComplete:()=>void;onNearby:(id:string|null)=>void;onArea:(area:string)=>void;onLock:(locked:boolean)=>void}) {
 const blackout=snapshot?.sabotage==='blackout';
 const storm=snapshot?.story.turbulence.active;
 const pressure=snapshot?.experience.incident==='decompression';
 const presenting=snapshot?.safety.status==='demonstrating'&&snapshot.safety.operatorId===session.id();
 const mode=sceneMode(snapshot,session.id(),departing,emergencyDescent);
 useEffect(()=>{if(mode==='intro')preloadGateAssets();},[mode]);
 return <SceneBoundary view={mode}><Canvas data-scene={mode} camera={CAMERA} dpr={DPR} shadows gl={RENDERER}>
 <SceneCamera mode={mode}/>
 <Fragment key={mode}>
 {mode==='gate'||mode==='journey-flight'?<JourneyScene snapshot={snapshot!} meId={session.id()} enabled={enabled} onLock={onLock}/>
 :mode==='emergency'?<EmergencyDescent onComplete={onEmergencyComplete}/>
 :mode==='departure'?<DepartureScene onComplete={onDepartureComplete}/>
 :mode==='intro'?<BoardingScene/>:<>
 <color attach="background" args={[snapshot?'#b8d5df':'#e8eef2']}/><fog attach="fog" args={[snapshot?'#b8d5df':'#e8eef2',snapshot?250:38,snapshot?2200:100]}/>
 <ambientLight intensity={blackout?.08:snapshot?.55:1.1}/><hemisphereLight args={[snapshot?(storm?'#bccbd9':'#e4f2ff'):'#d7f2ff',snapshot?'#536778':'#a39a81',blackout?.13:snapshot?1.1:1.5]}/><directionalLight position={[8,15,5]} intensity={blackout?.05:snapshot?(storm?.55:1):3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-normalBias={.025}/>
 {snapshot&&<><IncidentHorizon snapshot={snapshot}>{snapshot.operations?.stage==='boarding'?<><FlightAtmosphere/><mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.2,0]}><planeGeometry args={[1500,1500]}/><meshStandardMaterial color="#abb6b5" roughness={.95}/></mesh><Suspense fallback={null}><JourneyAsset name="airport-terminal" position={[35,-1,-16]} rotation={[0,Math.PI/2,0]}/></Suspense></>:<FlightEnvironment moving={snapshot.phase==='playing'}/>}</IncidentHorizon><CabinReflections blackout={blackout}/></>}
 {snapshot?.operations?.bomb&&<PlantedCase x={snapshot.operations.bomb.x} z={snapshot.operations.bomb.z}/>}
 <FirstPersonTool tool={snapshot?.players.find(p=>p.id===session.id())?.equippedTool??null}/>
 {snapshot&&[-11,-5,2,10,16].map(z=><pointLight key={z} position={[0,2.8,z]} color='#fff4df' intensity={blackout?0:7} distance={11} decay={2}/>)}
 {snapshot&&<>
  <Aircraft blackout={blackout} completedTasks={snapshot.tasks.filter(t=>t.completed).map(t=>t.id)}/>
  <DutyMarkers snapshot={snapshot}/>
  <Suspense fallback={null}><IncidentEffects snapshot={snapshot}/></Suspense>
  <Suspense fallback={null}><CabinNpcs npcs={snapshot.npcs} experience={snapshot.experience} turbulence={!!storm||pressure}/></Suspense>
  {snapshot.players.filter(p=>(p.id!==session.id()||presenting)&&(!snapshot.operations||snapshot.operations.roster.find(entry=>entry.playerId===p.id)?.boarded)).map(p=><Suspense key={p.id} fallback={null}><CrewAvatar player={p} safety={snapshot.safety.operatorId===p.id&&snapshot.safety.status==='demonstrating'?snapshot.safety:undefined}/></Suspense>)}
  <SafetyStationSign complete={snapshot.safety.status==='complete'}/>
  <Controls cameraOverride={presenting} turbulence={storm?Math.max(.25,Math.abs(snapshot.story.turbulence.roll)):pressure?.22:0} enabled={enabled} onNearby={onNearby} onArea={onArea} onLock={onLock}/>
  {presenting&&<SafetyPresentationCamera safety={snapshot.safety}/>}
 </>}
 </>}
 </Fragment></Canvas></SceneBoundary>;
}
