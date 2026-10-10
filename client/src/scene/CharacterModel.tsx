import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, Group, LoopOnce, MathUtils, Mesh, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { SafetyDemoState, ServiceItem } from '../../../shared/protocol';
import { ServiceItemModel } from './ServiceItemModel';
import { ToolModel, type HeldToolKind } from './HeldTool';
import { SafetyEquipment, type SafetyEquipmentHandle } from './SafetyEquipment';

const MODEL_NAMES = new Set(['attendant','attendant-player','pilot','marshal','engineer','passenger-a','passenger-b','passenger-c']);
function modelName(model: string) { const name=model.replace('-seated','');return MODEL_NAMES.has(name)?name:'passenger-a'; }
const SAFETY_CLIPS = ['SafetySeatbelt', 'SafetyOxygen', 'SafetyLifeVest', 'SafetyExits'] as const;

/** Hold the two belt halves up during the supplied narration, then demonstrate the latch. */
function demonstrationClipTime(step: number, elapsed: number) {
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  if (step !== 0) return Math.min(t, 4);
  if (t < 1) return t * .65;
  if (t < 8) return .65 + (t - 1) / 7 * .7;
  if (t < 10) return 1.35 + (t - 8) / 2 * .9;
  return Math.min(4, 2.25 + (t - 10) / 4.5 * 1.75);
}

function WornOxygenMask(){
 const {scene}=useGLTF('/models/safety/oxygen-mask.glb',false,false);
 const object=useMemo(()=>scene.clone(true),[scene]);
 return <primitive object={object} dispose={null}/>;
}

function Sidearm() {
  const { scene }=useGLTF('/models/animated/sidearm.glb',false,false);
  const object=useMemo(()=>scene.clone(true),[scene]);
  return <primitive object={object} dispose={null}/>;
}

/** Original Blender humanoids with independent skeletons, shared geometry and action clips. */
export function AuthoredCharacterModel({ model, movement, carrying=false, item=null, pose='idle', weapon=false, brace=false, seatedDeath=false, safety, oxygenMask=false, tool=null }: {
  model:string; movement?:MutableRefObject<number>; carrying?:boolean; item?:ServiceItem|null; pose?:string; weapon?:boolean; brace?:boolean; seatedDeath?:boolean; safety?:SafetyDemoState; oxygenMask?:boolean; tool?:HeldToolKind|null;
}) {
  const { scene,animations }=useGLTF(`/models/animated/${modelName(model)}.glb`,false,false);
  const initialPose=useRef(pose);
  const asset=useMemo(()=>{
    const object=clone(scene) as Group, skeletons=new Set<Skeleton>();
    object.traverse(node=>{if(node instanceof Mesh){node.castShadow=true;node.receiveShadow=true;}if(node instanceof SkinnedMesh){skeletons.add(node.skeleton);node.frustumCulled=false;}});
    const mixer=new AnimationMixer(object);
    const actions=Object.fromEntries(animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    const findHand=(side:string)=>object.getObjectByName(`Hand.${side}`)??object.getObjectByName(`Hand${side}`);
    return {object,skeletons,mixer,actions,actionEntries:Object.entries(actions),left:findHand('L'),right:findHand('R')};
  },[scene,animations]);
  const previousPose=useRef(pose), transition=useRef(0), tray=useRef<Group>(null), arm=useRef<Group>(null);
  const character = useRef<Group>(null), safetyEquipment = useRef<SafetyEquipmentHandle>(null);
  const demonstrating = safety?.status === 'demonstrating' && pose !== 'dead' && !!SAFETY_CLIPS[safety.step];
  const vectors=useMemo(()=>({left:new Vector3(),right:new Vector3(),mid:new Vector3()}),[]);
  const walk=useRef(0);
  useEffect(()=>{
    for(const [name,action] of asset.actionEntries) {
      if(['Sit','Stand','DeadStanding','Dead'].includes(name)||name.startsWith('Safety')){action.setLoop(LoopOnce,1);action.clampWhenFinished=true;}
      action.reset().play().setEffectiveWeight(0);
      if(name.startsWith('Safety'))action.paused=true;
    }
    asset.actions[initialPose.current==='seated'?'Seated':'Idle']?.setEffectiveWeight(1);
    return()=>{asset.mixer.stopAllAction();asset.mixer.uncacheRoot(asset.object);asset.skeletons.forEach(s=>s.dispose());};
  },[asset]);
  useEffect(()=>{
    if(pose==='sitting')asset.actions.Sit?.reset().play();
    if(pose==='dead')asset.actions[seatedDeath?'Dead':'DeadStanding']?.reset().play();
    if((previousPose.current==='seated'||previousPose.current==='sitting')&&(pose==='standing'||pose==='idle'||pose==='walking')){
      asset.actions.Stand?.reset().play();transition.current=1.25;
    }
    previousPose.current=pose;
  },[pose,seatedDeath,asset]);
  useFrame((_,dt)=>{
    const delta=Math.min(dt,.1); walk.current=MathUtils.damp(walk.current,movement?.current??(pose==='walking'?1:0),9,delta);
    transition.current=Math.max(0,transition.current-delta);
    let active='Idle', motion=walk.current;
    if(pose==='dead'){active=seatedDeath?'Dead':'DeadStanding';motion=0;}
    else if(demonstrating&&safety){active=SAFETY_CLIPS[safety.step];motion=0;}
    else if(pose==='sitting'){active='Sit';motion=0;}
    else if(pose==='seated'){active=brace?'Brace':'Seated';motion=0;}
    else if(transition.current>0){active='Stand';motion=0;}
    else if(weapon||tool){active=tool==='bomb'?'Carry':'Weapon';motion=0;}
    else if(pose==='serving'){active='Serve';motion=0;}
    else if(carrying){active=motion>.08?'Carry':'Serve';motion=0;}
    else if(pose==='reading'){active='Serve';motion=0;}
    else if(pose==='resting'){active='Idle';motion=0;}
    else if(pose==='gesture'){active='Gesture';motion=0;}
    const safetyTime = demonstrating&&safety ? demonstrationClipTime(safety.step, safety.elapsed) : 0;
    for(const [name,action] of asset.actionEntries) {
      const goal=active==='Idle'?(name==='Idle'?1-motion:name==='Walk'?motion:0):name===active?1:0;
      action.setEffectiveWeight(MathUtils.damp(action.getEffectiveWeight(),goal,12,delta));
      if (name === active && demonstrating) {
        // The server owns time. Paused actions still evaluate their assigned pose in the mixer.
        action.enabled = true; action.paused = true; action.time = safetyTime;
      }
    }
    asset.mixer.update(delta);
    character.current?.updateWorldMatrix(true,false);
    asset.object.updateMatrixWorld(true);
    if (demonstrating&&safety&&character.current) safetyEquipment.current?.update(safety.step,safetyTime,character.current,asset.left,asset.right);
    if(tray.current&&asset.left&&asset.right){
      asset.left.getWorldPosition(vectors.left);asset.right.getWorldPosition(vectors.right);
      vectors.mid.copy(vectors.left).add(vectors.right).multiplyScalar(.5);vectors.mid.y+=.008;
      tray.current.parent!.worldToLocal(vectors.mid);tray.current.position.copy(vectors.mid);
    }
    if(arm.current&&asset.right){asset.right.getWorldPosition(vectors.right);arm.current.parent!.worldToLocal(vectors.right);arm.current.position.copy(vectors.right);arm.current.position.y+=.015;arm.current.position.z-=.05;}
  });
  return <group ref={character}>
    <primitive object={asset.object} dispose={null}/>
    {oxygenMask&&pose!=='dead'&&!demonstrating&&<group position={[0,1.605,-.127]}><Suspense fallback={null}><WornOxygenMask/></Suspense></group>}
    {pose==='reading'&&!item&&<group ref={tray} position={[0,1.04,-.34]} rotation={[-.35,0,0]}><mesh><boxGeometry args={[.34,.012,.23]}/><meshStandardMaterial color='#edf0de'/></mesh><mesh position={[0,.008,0]}><boxGeometry args={[.005,.005,.23]}/><meshStandardMaterial color='#426772'/></mesh></group>}
    {demonstrating&&<Suspense fallback={null}><SafetyEquipment ref={safetyEquipment}/></Suspense>}
    {item&&pose!=='dead'&&!demonstrating&&<group ref={tray} position={[0,1.04,-.34]}><Suspense fallback={null}><ServiceItemModel item={item}/></Suspense></group>}
    {(weapon||tool)&&pose!=='dead'&&!demonstrating&&<group ref={arm} position={[.045,1.22,-.49]}><Suspense fallback={null}>{tool?<ToolModel tool={tool} held/>:<Sidearm/>}</Suspense></group>}
  </group>;
}

export function CharacterModel({movement,model='passenger-a',carrying=false,item=null,weapon=false,pose='idle',safety,oxygenMask=false,tool=null}:{movement:MutableRefObject<number>;model?:string;carrying?:boolean;item?:ServiceItem|null;weapon?:boolean;pose?:string;safety?:SafetyDemoState;oxygenMask?:boolean;tool?:HeldToolKind|null}){
  return <AuthoredCharacterModel model={model} movement={movement} carrying={carrying} item={item} weapon={weapon} pose={pose} safety={safety} oxygenMask={oxygenMask} tool={tool}/>;
}
