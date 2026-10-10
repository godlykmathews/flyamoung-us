import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { session } from '../network/session';
import { input } from '../game/input';
import { EYE_HEIGHT, movePlayer, nearestTask, areaAt } from '../../../shared/world';
import { canDoTask } from '../../../shared/duties';
import type { Phase } from '../../../shared/protocol';

function stopMovement() {
 const snapshot=session.get().snapshot;
 const me=snapshot?.players.find(p=>p.id===session.id());
 // A stop during restart must preserve the server's new spawn heading.
 session.send('move',{dx:0,dz:0,yaw:snapshot?.phase==='lobby'&&me?me.yaw:input.yaw});
}
export function Controls({enabled,onNearby,onArea,onLock,turbulence=0,cameraOverride=false}:{enabled:boolean;onNearby:(id:string|null)=>void;onArea:(area:string)=>void;onLock:(locked:boolean)=>void;turbulence?:number;cameraOverride?:boolean}) {
 const {camera,gl}=useThree(); const keys=useRef(new Set<string>()); const initialized=useRef(false);const timer=useRef(0);const uiTimer=useRef(0);const drag=useRef(false);const euler=useRef(new Euler(0,0,0,'YXZ'));
 const previous=useRef<{roomId:string;phase:Phase}|null>(null);
 const targetPosition=useRef(new Vector3());const targetRotation=useRef(new Quaternion());const stride=useRef(0);const sway=useRef(0);
 const reducedMotion=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{reducedMotion.current=preference.matches;};
  preference.addEventListener('change',update);return()=>preference.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  input.active=enabled;
  if(!enabled){keys.current.clear();drag.current=false;stopMovement();if(document.pointerLockElement)document.exitPointerLock();}
 },[enabled]);
 useEffect(()=>{
  const canvas=gl.domElement; canvas.tabIndex=0;
  const lock=()=>{input.locked=document.pointerLockElement===canvas;onLock(input.locked);if(!input.locked){keys.current.clear();stopMovement();}};
  const down=(e:KeyboardEvent)=>{if(!input.active || /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)){e.preventDefault();keys.current.add(e.code);}};
  const up=(e:KeyboardEvent)=>keys.current.delete(e.code);
  const reset=()=>{keys.current.clear();stopMovement();};
  const mouse=(e:MouseEvent)=>{if(!input.active||(!input.locked&&!drag.current))return;input.yaw-=e.movementX*0.002;input.pitch=Math.max(-1.2,Math.min(1.2,input.pitch-e.movementY*0.002));};
  const click=(e:MouseEvent)=>{if(!input.active)return;canvas.focus();if(e.button===2){drag.current=true;return;}if(!document.pointerLockElement){try{const request=canvas.requestPointerLock?.();request?.catch(()=>{});}catch{/* Drag look remains available. */}}};
  const release=()=>{drag.current=false;};const context=(e:MouseEvent)=>e.preventDefault();
  document.addEventListener('pointerlockchange',lock);window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);document.addEventListener('mousemove',mouse);canvas.addEventListener('mousedown',click);window.addEventListener('mouseup',release);canvas.addEventListener('contextmenu',context);
  lock();
  return ()=>{reset();input.active=false;input.locked=false;drag.current=false;onLock(false);document.removeEventListener('pointerlockchange',lock);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);document.removeEventListener('mousemove',mouse);canvas.removeEventListener('mousedown',click);window.removeEventListener('mouseup',release);canvas.removeEventListener('contextmenu',context);};
 },[gl,onLock]);
 useFrame((_,delta)=>{
  const snapshot=session.get().snapshot; const me=snapshot?.players.find(p=>p.id===session.id()); if(!snapshot||!me)return;
  if(!initialized.current||previous.current?.roomId!==snapshot.roomId||(snapshot.phase==='lobby'&&previous.current?.phase!=='lobby')){
   input.x=me.x;input.z=me.z;input.yaw=me.yaw;input.pitch=0;input.moving=false;initialized.current=true;
   keys.current.clear();drag.current=false;timer.current=0;uiTimer.current=0;
   camera.position.set(input.x,EYE_HEIGHT,input.z);euler.current.set(0,input.yaw,0);camera.quaternion.setFromEuler(euler.current);stride.current=0;sway.current=0;
  }
  previous.current={roomId:snapshot.roomId,phase:snapshot.phase};
  const condition=snapshot.experience.players[me.id];
  // Moving intentionally releases the game seatbelt on the server. Do not
  // suppress that first movement packet or the player would remain locked.
  const canMove=enabled&&!me.detained&&!condition?.incapacitated&&!snapshot.operations?.restraints[me.id];
  let dx=0,dz=0;
  if(enabled&&!me.detained&&!condition?.incapacitated){
   const k=keys.current;input.yaw+=((k.has('ArrowLeft')?1:0)-(k.has('ArrowRight')?1:0))*delta*1.7;
   input.pitch=Math.max(-1.2,Math.min(1.2,input.pitch+((k.has('ArrowUp')?1:0)-(k.has('ArrowDown')?1:0))*delta));
   const forward=canMove?(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0):0,side=canMove?(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0):0;
   dx=-Math.sin(input.yaw)*forward+Math.cos(input.yaw)*side;dz=-Math.cos(input.yaw)*forward-Math.sin(input.yaw)*side;
   const pos=movePlayer(input.x,input.z,dx,dz,delta);input.x=pos.x;input.z=pos.z;
  }
  if(Math.hypot(input.x-me.x,input.z-me.z)>0.85){input.x=me.x;input.z=me.z;}
  input.moving=!!(dx||dz);
  if(cameraOverride){input.x=me.x;input.z=me.z;input.yaw=me.yaw;input.pitch=0;return;}
  // The server and local prediction still move at exactly WALK_SPEED. Only the
  // visual eye eases into steps and small network corrections, so smoothing
  // cannot grant acceleration, teleporting or an advantage in interaction range.
  const blend=1-Math.exp(-20*Math.min(delta,.1));
  stride.current=MathUtils.damp(stride.current,input.moving&&!reducedMotion.current?1:0,12,delta);
  sway.current=MathUtils.damp(sway.current,enabled?MathUtils.clamp(turbulence,0,1):0,3,delta);
  const time=performance.now()*.001;const shake=reducedMotion.current?0:sway.current*(condition?.seatbelt?.55:1);
  const bob=Math.sin(time*8.5)*.013*stride.current;
  targetPosition.current.set(input.x+Math.sin(time*2.7)*.015*shake,EYE_HEIGHT+bob+Math.sin(time*5.1)*.026*shake,input.z);
  camera.position.lerp(targetPosition.current,blend);
  euler.current.set(input.pitch+Math.sin(time*2.1)*.006*shake,input.yaw,Math.sin(time*3.7)*.009*shake);
  targetRotation.current.setFromEuler(euler.current);camera.quaternion.slerp(targetRotation.current,1-Math.exp(-30*Math.min(delta,.1)));
  timer.current+=delta;uiTimer.current+=delta;
  if(timer.current>0.05){timer.current=0;if(canMove)session.send('move',{dx,dz,yaw:input.yaw});}
  if(uiTimer.current>0.15){
   uiTimer.current=0;
   const repairId=snapshot.sabotage?{blackout:'electrical',comms:'radio',navigation:'navigation'}[snapshot.sabotage]:null;
   const task=nearestTask(input.x,input.z, station=>canDoTask(me.role,station.id,snapshot.training)
    && (station.id===repairId||!snapshot.tasks.find(state=>state.id===station.id)?.completed));
   onNearby(task?.id??null);onArea(areaAt(input.z));
  }
 });
 return null;
}
