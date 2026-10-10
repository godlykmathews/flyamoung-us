import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SEAT_ROWS, TASKS } from '../../../shared/world';

const cube = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const colors = { cream: '#eee9db', shell: '#d9d7c9', teal: '#28696b', navy: '#172e36', gold: '#e7b66a', steel: '#617275' };
const mat = {
 cream: new THREE.MeshStandardMaterial({ color: colors.cream, roughness: 0.62 }),
 shell: new THREE.MeshStandardMaterial({ color: colors.shell, roughness: 0.7 }),
 teal: new THREE.MeshStandardMaterial({ color: colors.teal, roughness: 0.8 }),
 navy: new THREE.MeshStandardMaterial({ color: colors.navy, roughness: 0.92 }),
 steel: new THREE.MeshStandardMaterial({ color: colors.steel, metalness: 0.65, roughness: 0.35 }),
 dark: new THREE.MeshStandardMaterial({ color: '#101e24', roughness: 0.65 }),
 gold: new THREE.MeshStandardMaterial({ color: colors.gold, metalness: 0.35, roughness: 0.35 }),
 light: new THREE.MeshBasicMaterial({ color: '#ffe3a2' }),
 cyan: new THREE.MeshBasicMaterial({ color: '#7fe0dc' }),
 glass: new THREE.MeshStandardMaterial({ color: '#244853', roughness: 0.18, metalness: 0.25 }),
};
type Vec3 = [number, number, number];
function Box({ position, scale, material = mat.cream, rotation }: { position: Vec3; scale: Vec3; material?: THREE.Material; rotation?: Vec3 }) {
 return <mesh geometry={cube} material={material} position={position} scale={scale} rotation={rotation} castShadow receiveShadow />;
}
function roundedPlane(width: number, height: number, radius: number) {
 const s = new THREE.Shape(); const x=-width/2, y=-height/2;
 s.moveTo(x+radius,y); s.lineTo(x+width-radius,y); s.quadraticCurveTo(x+width,y,x+width,y+radius);
 s.lineTo(x+width,y+height-radius); s.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);
 s.lineTo(x+radius,y+height); s.quadraticCurveTo(x,y+height,x,y+height-radius);
 s.lineTo(x,y+radius); s.quadraticCurveTo(x,y,x+radius,y);
 return new THREE.ShapeGeometry(s, 6);
}
const windowFrame = roundedPlane(0.84,1.1,0.29);
const windowPane = roundedPlane(0.67,0.9,0.24);

function makeTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, width=512, height=256) {
 const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
 const ctx=canvas.getContext('2d'); if (ctx) draw(ctx,width,height);
 const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}
function Label({text, subtitle, position, rotation=[0,0,0], width=1.1, height=0.35, background='#172e36', color='#eee9db'}: {
 text:string;subtitle?:string;position:Vec3;rotation?:Vec3;width?:number;height?:number;background?:string;color?:string;
}) {
 const texture=useMemo(()=>makeTexture((ctx,w,h)=>{
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 44px Arial, sans-serif';ctx.fillText(text,w/2,subtitle?h*0.4:h*0.52,w-36);
  if(subtitle){ctx.font='20px Arial, sans-serif';ctx.fillStyle='#a9b9b2';ctx.fillText(subtitle,w/2,h*0.72,w-34);}
 },512,subtitle?192:128),[text,subtitle,background,color]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <mesh geometry={unitPlane} position={position} rotation={rotation} scale={[width,height,1]}><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}

/** Each structural seat part is instanced across all twenty seats. */
function SeatPart({ position, scale, material, tilt=0 }: {position:Vec3;scale:Vec3;material:THREE.Material;tilt?:number}) {
 const ref=useRef<THREE.InstancedMesh>(null);
 useLayoutEffect(()=>{
  const transform=new THREE.Object3D();let i=0;
  for(const z of SEAT_ROWS) for(const x of [-2.35,-1.3,1.3,2.35]) {
   transform.position.set(x+position[0],position[1],z+position[2]);transform.rotation.set(tilt,0,0);transform.scale.set(...scale);transform.updateMatrix();ref.current?.setMatrixAt(i++,transform.matrix);
  }
  if(ref.current){ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();}
 },[position,scale,tilt]);
 return <instancedMesh ref={ref} args={[cube,material,20]} castShadow receiveShadow/>;
}
function Seats() {
 return <group>
  <SeatPart position={[0,0.25,0.03]} scale={[0.65,0.47,0.61]} material={mat.dark}/>
  <SeatPart position={[0,0.53,-0.08]} scale={[0.88,0.18,0.96]} material={mat.teal}/>
  <SeatPart position={[0,1.06,0.4]} scale={[0.9,1.15,0.18]} material={mat.shell} tilt={-0.09}/>
  <SeatPart position={[0,1.08,0.285]} scale={[0.77,1.0,0.16]} material={mat.teal} tilt={-0.09}/>
  <SeatPart position={[0,1.51,0.255]} scale={[0.6,0.23,0.1]} material={mat.cream} tilt={-0.09}/>
  <SeatPart position={[0,0.84,0.518]} scale={[0.65,0.28,0.035]} material={mat.navy}/>
  <SeatPart position={[0,0.995,0.545]} scale={[0.57,0.025,0.024]} material={mat.steel}/>
  <SeatPart position={[-0.48,0.76,-0.02]} scale={[0.085,0.07,0.72]} material={mat.shell}/>
  <SeatPart position={[0.48,0.76,-0.02]} scale={[0.085,0.07,0.72]} material={mat.shell}/>
  <SeatPart position={[0,0.631,-0.12]} scale={[0.75,0.025,0.07]} material={mat.gold}/>
 </group>;
}
function CabinShell({ blackout }: {blackout:boolean}) {
 const sky=useMemo(()=>makeTexture((ctx,w,h)=>{
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#416a89');gradient.addColorStop(0.55,'#a6cbd5');gradient.addColorStop(0.57,'#dae4de');gradient.addColorStop(1,'#b1c5ca');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(255,255,247,0.66)';for(let i=0;i<9;i++){ctx.beginPath();ctx.ellipse((i*173)%w,h*.71+(i%3)*17,95+(i%2)*32,14,0,0,Math.PI*2);ctx.fill();}
 }),[]);
 useEffect(()=>()=>sky.dispose(),[sky]);
 const carpet=useMemo(()=>makeTexture((ctx,w,h)=>{ctx.fillStyle='#33494b';ctx.fillRect(0,0,w,h);for(let i=0;i<w;i+=4){ctx.fillStyle=i%8?'#3a5051':'#2e4244';ctx.fillRect(i,0,1,h);}for(let i=0;i<h;i+=7){ctx.fillStyle='#425557';ctx.fillRect(0,i,w,1);}},128,128),[]);
 carpet.wrapS=carpet.wrapT=THREE.RepeatWrapping;carpet.repeat.set(8,32);
 useEffect(()=>()=>carpet.dispose(),[carpet]);
 const profile=[[-3,0],[-3,2.08],[-2.76,2.61],[-2.12,3.02],[-1.03,3.2],[1.03,3.2],[2.12,3.02],[2.76,2.61],[3,2.08],[3,0]];
 return <group>
  <mesh position={[0,-0.06,0.1]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[6,27.5]}/><meshStandardMaterial map={carpet} roughness={1}/></mesh>
  {profile.slice(1).map((p,i)=>{const a=profile[i],dx=p[0]-a[0],dy=p[1]-a[1];return <Box key={i} position={[(p[0]+a[0])/2,(p[1]+a[1])/2,0.1]} scale={[Math.hypot(dx,dy),0.09,27.5]} rotation={[0,0,Math.atan2(dy,dx)]}/>;})}
  {[-1,1].map(side=><group key={side}>
   <Box position={[side*2.92,0.37,0.1]} scale={[0.1,0.5,27.4]} material={mat.shell}/>
   <Box position={[side*2.91,0.07,0.1]} scale={[0.05,0.05,27.4]} material={mat.steel}/>
   <Box position={[side*0.7,0.006,0.1]} scale={[0.035,0.009,26.8]} material={mat.gold}/>
   <Box position={[side*1.78,2.965,0]} scale={[0.09,0.03,26.9]} material={blackout?mat.navy:mat.light}/>
   {Array.from({length:10},(_,i)=>-8.25+i*1.83).map((z,i)=><group key={i} position={[side*2.937,1.63,z]} rotation={[0,-side*Math.PI/2,0]}>
    <mesh geometry={windowFrame} material={mat.shell}/>
    <mesh geometry={windowPane} position={[0,0,0.012]}><meshBasicMaterial map={sky} color={blackout?'#5b8198':'#ffffff'} toneMapped={false}/></mesh>
    <Box position={[0,-0.62,0.035]} scale={[0.86,0.06,0.1]}/>
   </group>)}
   {Array.from({length:9},(_,i)=>-8.4+i*2.6).map((z,i)=><group key={i}>
    <Box position={[side*2.44,2.56,z]} scale={[0.72,0.4,2.49]} rotation={[0,0,side*.13]} material={mat.cream}/>
    <Box position={[side*2.067,2.52,z]} scale={[0.032,0.055,0.24]} material={mat.steel}/>
    <Box position={[side*2.5,2.805,z]} scale={[0.46,0.016,2.44]} material={mat.shell}/>
   </group>)}
   {SEAT_ROWS.map((z,i)=><group key={z}>
    <Label text={`0${i+1}  ${side<0?'A B':'C D'}`} position={[side*2.074,2.54,z]} rotation={[0,-side*Math.PI/2,0]} width={0.38} height={0.12} background='#d9d7c9' color='#33494b'/>
    <Box position={[side*0.61,0.008,z+0.2]} scale={[0.05,0.015,0.34]} material={mat.light}/>
   </group>)}
  </group>)}
  {[-8.5,-5.5,-2.5,.5,3.5,6.5,9.5,12].map(z=><group key={z}>
   <Box position={[0,3.125,z]} scale={[0.52,0.04,0.12]} material={blackout?mat.dark:mat.light}/>
   <Box position={[0,3.18,z]} scale={[5.05,0.025,0.025]} material={mat.shell}/>
  </group>)}
 </group>;
}
function FlightDeck() {
 return <group>
  <Box position={[0,0.001,-11.85]} scale={[5.8,0.025,3.6]} material={mat.navy}/>
  {[-1,1].map(side=><group key={side}>
   <Box position={[side*1.68,1.55,-10]} scale={[2.55,3.1,0.14]} material={mat.shell}/>
   <Box position={[side*0.385,1.2,-9.91]} scale={[0.08,2.4,0.075]} material={mat.steel}/>
   <Box position={[side*1.65,0.67,-12.65]} scale={[1.55,1.3,1.6]} material={mat.dark}/>
   <Box position={[side*1.65,1.32,-12.65]} scale={[1.57,0.09,1.6]} material={mat.steel}/>
   <Box position={[side*1.65,1.53,-13.09]} scale={[1.37,0.51,0.17]} rotation={[-.25,0,0]} material={mat.dark}/>
   <Label text={side<0?'SYSTEMS NOMINAL':'ROUTE / 404'} subtitle={side<0?'ALT 36,000   •   IAS 460':'DEL → SIN    ·    AUTO'} position={[side*1.65,1.57,-12.98]} rotation={[-.25,0,0]} width={1.21} height={0.4} background='#143a40' color='#9de2c7'/>
   <Box position={[side*1.65,1.415,-12.35]} scale={[0.8,0.035,0.34]} material={mat.dark}/>
   <Box position={[side*1.65,1.58,-12.3]} scale={[0.04,0.3,0.035]} material={mat.steel}/>
   <Box position={[side*1.65,1.72,-12.3]} scale={[0.31,0.045,0.04]} material={mat.dark}/>
   <Label text={side<0?'FLIGHT DECK':'CREW ACCESS'} position={[side*1.62,1.85,-9.912]} width={1.45} height={0.33} background='#d9d7c9' color='#385455'/>
  </group>)}
  <Box position={[0,2.84,-10]} scale={[0.83,0.57,0.14]} material={mat.shell}/>
  <Label text='FLIGHT 404' position={[0,2.85,-9.914]} width={0.67} height={0.15} background='#d9d7c9' color='#385455'/>
  <Box position={[0,1.6,-13.65]} scale={[5.8,3.2,0.1]} material={mat.dark}/>
  <mesh position={[0,2.12,-13.58]}><planeGeometry args={[5.2,1.2]}/><meshBasicMaterial color='#9cbec8'/></mesh>
  <Box position={[0,2.12,-13.51]} scale={[0.12,1.3,0.09]} material={mat.dark}/>
  {[-1,1].map(side=><Box key={side} position={[side*1.73,2.12,-13.50]} scale={[0.08,1.3,0.08]} material={mat.dark} rotation={[0,0,side*.22]}/>)}
 </group>;
}
function AftCabin() {
 return <group>
  <Box position={[-2.4,1.1,9.4]} scale={[1,2.2,2.1]} material={mat.shell}/>
  <Box position={[-1.885,1.29,9.4]} scale={[0.035,0.91,1.75]} material={mat.navy}/>
  {[8.78,9.4,10.02].map(z=><group key={z}>
   <Box position={[-1.855,0.54,z]} scale={[0.035,0.9,0.58]} material={mat.steel}/>
   <Box position={[-1.823,0.8,z]} scale={[0.035,0.045,0.23]} material={mat.gold}/>
   <Box position={[-1.81,1.04,z]} scale={[0.3,0.055,0.54]} material={mat.cream}/>
   <Box position={[-1.86,1.61,z]} scale={[0.05,0.13,0.39]} material={mat.shell}/>
  </group>)}
  <Label text='CABIN SERVICE' subtitle='GALLEY / 02' position={[-1.873,1.92,9.4]} rotation={[0,Math.PI/2,0]} width={1.6} height={0.32}/>
  <Box position={[2.4,1.23,12.3]} scale={[1,2.46,2.1]} material={mat.steel}/>
  <Box position={[1.875,1.15,12.3]} scale={[0.025,1.66,1.7]} material={mat.dark}/>
  {[11.67,12.09,12.51,12.93].map(z=><group key={z}>
   <Box position={[1.845,1.37,z]} scale={[0.045,0.66,0.31]} material={mat.shell}/>
   <Box position={[1.81,1.46,z]} scale={[0.03,0.24,0.11]} material={mat.dark}/>
   <Box position={[1.795,1.57,z]} scale={[0.035,0.055,0.07]} material={mat.cyan}/>
  </group>)}
  <Label text='POWER DISTRIBUTION' subtitle='AUTHORIZED ENGINEER ACCESS' position={[1.87,2.13,12.3]} rotation={[0,-Math.PI/2,0]} width={1.7} height={0.32}/>
  <Box position={[0,1.6,13.8]} scale={[6,3.2,0.12]} material={mat.shell}/>
  <Label text='FLIGHT 404' subtitle='EVERY CREW HAS A SECRET.' position={[0,1.79,13.727]} rotation={[0,Math.PI,0]} width={2.1} height={0.65}/>
  <Label text='EXIT' position={[0,2.78,13.727]} rotation={[0,Math.PI,0]} width={0.52} height={0.2} background='#2c6557' color='#f3eee2'/>
  {[-1,1].map(side=><group key={side}>
   <Box position={[side*2.936,1.25,7.72]} scale={[0.032,2.3,1.12]} material={mat.shell}/>
   <Label text='EXIT' position={[side*2.905,2.17,7.72]} rotation={[0,-side*Math.PI/2,0]} width={0.57} height={0.22} background='#2c6557' color='#f3eee2'/>
   <Box position={[side*2.876,1.09,7.72]} scale={[0.05,0.06,0.34]} material={mat.gold}/>
  </group>)}
 </group>;
}
function TaskStations({completedTasks}: {completedTasks:string[]}) {
 return <group>{TASKS.map((task,i)=>{
  const done=completedTasks.includes(task.id),color=done?'#86c5aa':task.color;
  const rotation:Vec3=task.id==='meals'?[0,Math.PI/2,0]:task.id==='electrical'?[0,-Math.PI/2,0]:[0,0,0];
  // Tablets sit just in front of their physical cabinet/console surfaces.
  const x=task.id==='meals'?-1.78:task.id==='electrical'?1.78:task.x;
  const cockpit=task.id==='checklist'||task.id==='navigation';
  return <group key={task.id} position={[x,cockpit?1.62:1.25,cockpit?-11.78:task.z]} rotation={rotation}>
   <Box position={[0,0,0]} scale={[0.41,0.49,0.075]} material={mat.dark}/>
   <mesh position={[0,0,0.044]}><planeGeometry args={[0.35,0.41]}/><meshBasicMaterial color={color}/></mesh>
   <Label text={done?'✓':`0${i+1}`} subtitle={done?'COMPLETE':'CREW TASK'} position={[0,0,0.046]} width={0.32} height={0.32} background={color} color='#172e36'/>
   <Box position={[0,-0.274,0]} scale={[0.19,0.025,0.08]} material={mat.steel}/>
   {task.id==='seatbelts'&&<Box position={[0,-0.62,0]} scale={[0.06,0.76,0.06]} material={mat.steel}/>}
  </group>;
 })}</group>;
}

export function Aircraft({blackout=false,completedTasks=[]}: {blackout?:boolean;completedTasks?:string[]}) {
 return <group dispose={null}><CabinShell blackout={blackout}/><Seats/><FlightDeck/><AftCabin/><TaskStations completedTasks={completedTasks}/></group>;
}

function wingGeometry(side:number, rear=false) {
 const shape=new THREE.Shape();
 const points=rear?[[1,8.1],[5.3,10.6],[5.7,11.4],[.65,10.6]]:[[1.1,-2.4],[10.9,3.7],[11.4,5.1],[1.1,2.4]];
 points.forEach(([x,z],i)=>i?shape.lineTo(x*side,z):shape.moveTo(x*side,z));shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:rear?.11:.16,bevelEnabled:true,bevelSize:.07,bevelThickness:.07,bevelSegments:1,steps:1});
 g.rotateX(Math.PI/2);return g;
}
const exteriorGeometry={
 body:new THREE.LatheGeometry([new THREE.Vector2(.03,-12.2),new THREE.Vector2(.39,-11.7),new THREE.Vector2(.96,-10.4),new THREE.Vector2(1.4,-8.4),new THREE.Vector2(1.51,-5.5),new THREE.Vector2(1.51,4.5),new THREE.Vector2(1.33,7),new THREE.Vector2(.7,10.2),new THREE.Vector2(.13,12)],48),
 wingLeft:wingGeometry(-1),wingRight:wingGeometry(1),stabilizerLeft:wingGeometry(-1,true),stabilizerRight:wingGeometry(1,true),
};
function TailFin() {
 const geometry=useMemo(()=>{
  const shape=new THREE.Shape();shape.moveTo(7.25,.65);shape.lineTo(9.25,5.6);shape.lineTo(10.6,5.65);shape.lineTo(11.8,.25);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSize:.08,bevelThickness:.05,bevelSegments:2});g.rotateY(-Math.PI/2);return g;
 },[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} material={mat.teal} castShadow/>;
}
/** Original, self-contained aircraft model used by the departure lounge's 3D hero. */
export function ExteriorAircraft() {
 const goldStripe=useMemo(()=>new THREE.MeshStandardMaterial({color:'#d5a760',metalness:.35,roughness:.3}),[]);
 useEffect(()=>()=>goldStripe.dispose(),[goldStripe]);
 return <group rotation={[0,-.1,-.035]} dispose={null}>
  <mesh geometry={exteriorGeometry.body} material={mat.cream} rotation={[Math.PI/2,0,0]} castShadow receiveShadow/>
  <TailFin/>
  <mesh geometry={exteriorGeometry.wingLeft} material={mat.cream} position={[0,-.28,0]} castShadow receiveShadow/>
  <mesh geometry={exteriorGeometry.wingRight} material={mat.cream} position={[0,-.28,0]} castShadow receiveShadow/>
  <mesh geometry={exteriorGeometry.stabilizerLeft} material={mat.cream} position={[0,.4,0]} castShadow/>
  <mesh geometry={exteriorGeometry.stabilizerRight} material={mat.cream} position={[0,.4,0]} castShadow/>
  {[-1,1].map(side=><group key={side}>
   <Box position={[side*1.499,0.12,-.25]} scale={[.025,.047,15.4]} material={goldStripe}/>
   {Array.from({length:15},(_,i)=>-7.4+i*.82).map(z=><mesh key={z} position={[side*1.436,.49,z]} rotation={[0,0,side*-.24]} scale={[.055,.18,.22]} material={mat.glass}><sphereGeometry args={[1,12,8]}/></mesh>)}
   <group position={[side*4.1,-1.01,.06]} rotation={[Math.PI/2,0,0]}>
    <mesh castShadow><cylinderGeometry args={[.76,.67,2.5,32]}/><meshStandardMaterial color='#e6e4d7' metalness={.3} roughness={.3}/></mesh>
    <mesh position={[0,-1.257,0]} rotation={[Math.PI/2,0,0]}><circleGeometry args={[.62,32]}/><meshBasicMaterial color='#122e35' side={THREE.DoubleSide}/></mesh>
    <mesh position={[0,-1.273,0]} rotation={[Math.PI/2,0,0]}><ringGeometry args={[.62,.73,32]}/><meshStandardMaterial color='#768b8b' side={THREE.DoubleSide} metalness={.75} roughness={.3}/></mesh>
    <mesh position={[0,-1.27,0]}><sphereGeometry args={[.19,12,8]}/><meshStandardMaterial color='#849692' metalness={.7} roughness={.25}/></mesh>
   </group>
   <Box position={[side*4.1,-.4,.45]} scale={[.15,.66,1.4]} material={mat.steel}/>
   <Box position={[side*11.05,.19,4.51]} scale={[.12,1.15,.77]} rotation={[0,0,-side*.2]} material={mat.teal}/>
   <mesh position={[side*1.03,.82,-9.32]} rotation={[0,side*.3,0]} scale={[.58,.32,.65]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color='#143c49' metalness={.4} roughness={.2}/></mesh>
   <Label text='404' position={[side*.132,3.65,9.92]} rotation={[0,side*Math.PI/2,0]} width={1.33} height={.81} background='#28696b' color='#f1ecdc'/>
  </group>)}
 </group>;
}
