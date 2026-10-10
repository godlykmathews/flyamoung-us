import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler } from 'three';
import { session } from '../network/session';
import { input } from '../game/input';
import { EYE_HEIGHT, movePlayer, nearestTask, areaAt } from '../../../shared/world';
export function Controls({enabled,onNearby,onArea,onLock}:{enabled:boolean;onNearby:(id:string|null)=>void;onArea:(area:string)=>void;onLock:(locked:boolean)=>void}) {
 const {camera,gl}=useThree(); const keys=useRef(new Set<string>()); const initialized=useRef(false);const timer=useRef(0);const uiTimer=useRef(0);const drag=useRef(false);const euler=useRef(new Euler(0,0,0,'YXZ'));
 useEffect(()=>{
  input.active=enabled;
  if(!enabled){keys.current.clear();session.send('move',{dx:0,dz:0,yaw:input.yaw});if(document.pointerLockElement)document.exitPointerLock();}
 },[enabled]);
 useEffect(()=>{
  const canvas=gl.domElement; canvas.tabIndex=0;
  const lock=()=>{input.locked=document.pointerLockElement===canvas;onLock(input.locked);if(!input.locked){keys.current.clear();session.send('move',{dx:0,dz:0,yaw:input.yaw});}};
  const down=(e:KeyboardEvent)=>{if(!input.active || /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)){e.preventDefault();keys.current.add(e.code);}};
  const up=(e:KeyboardEvent)=>keys.current.delete(e.code);
  const reset=()=>{keys.current.clear();session.send('move',{dx:0,dz:0,yaw:input.yaw});};
  const mouse=(e:MouseEvent)=>{if(!input.active||(!input.locked&&!drag.current))return;input.yaw-=e.movementX*0.002;input.pitch=Math.max(-1.2,Math.min(1.2,input.pitch-e.movementY*0.002));};
  const click=(e:MouseEvent)=>{if(!input.active)return;canvas.focus();if(e.button===2){drag.current=true;return;}if(!document.pointerLockElement){try{const request=canvas.requestPointerLock?.();request?.catch(()=>{});}catch{/* Drag look remains available. */}}};
  const release=()=>{drag.current=false;};const context=(e:MouseEvent)=>e.preventDefault();
  document.addEventListener('pointerlockchange',lock);window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);document.addEventListener('mousemove',mouse);canvas.addEventListener('mousedown',click);window.addEventListener('mouseup',release);canvas.addEventListener('contextmenu',context);
  return ()=>{reset();input.active=false;document.removeEventListener('pointerlockchange',lock);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);document.removeEventListener('mousemove',mouse);canvas.removeEventListener('mousedown',click);window.removeEventListener('mouseup',release);canvas.removeEventListener('contextmenu',context);};
 },[gl,onLock]);
 useFrame((_,delta)=>{
  const snapshot=session.get().snapshot; const me=snapshot?.players.find(p=>p.id===session.id()); if(!me)return;
  if(!initialized.current){input.x=me.x;input.z=me.z;input.yaw=me.yaw;input.pitch=0;initialized.current=true;}
  let dx=0,dz=0;
  if(enabled&&!me.detained){
   const k=keys.current;input.yaw+=((k.has('ArrowLeft')?1:0)-(k.has('ArrowRight')?1:0))*delta*1.7;
   input.pitch=Math.max(-1.2,Math.min(1.2,input.pitch+((k.has('ArrowUp')?1:0)-(k.has('ArrowDown')?1:0))*delta));
   const forward=(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),side=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0);
   dx=-Math.sin(input.yaw)*forward+Math.cos(input.yaw)*side;dz=-Math.cos(input.yaw)*forward-Math.sin(input.yaw)*side;
   const pos=movePlayer(input.x,input.z,dx,dz,delta);input.x=pos.x;input.z=pos.z;
  }
  if(Math.hypot(input.x-me.x,input.z-me.z)>0.85){input.x=me.x;input.z=me.z;}
  input.moving=!!(dx||dz);camera.position.set(input.x,EYE_HEIGHT+(input.moving?Math.sin(performance.now()*0.009)*0.022:0),input.z);euler.current.set(input.pitch,input.yaw,0);camera.quaternion.setFromEuler(euler.current);
  timer.current+=delta;uiTimer.current+=delta;
  if(timer.current>0.05){timer.current=0;session.send('move',{dx,dz,yaw:input.yaw});}
  if(uiTimer.current>0.15){uiTimer.current=0;onNearby(nearestTask(input.x,input.z)?.id??null);onArea(areaAt(input.z));}
 });
 return null;
}
