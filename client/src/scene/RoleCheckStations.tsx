import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { EQUIPMENT_IDS, TASKS } from '../../../shared/tasks';

const checks = TASKS.filter(task => !(EQUIPMENT_IDS as readonly string[]).includes(task.id));
type CheckTask = typeof checks[number];
/** Small mounted check terminals supplement the five authored Blender props. */
function CheckTerminal({ task, done }: { task: CheckTask; done: boolean }) {
 const screen = useMemo(() => {
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=384;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle='#e6eef0';ctx.fillRect(0,0,512,384);
  ctx.fillStyle='#203d51';ctx.fillRect(0,0,512,70);
  ctx.fillStyle='#fff';ctx.font='600 23px sans-serif';ctx.fillText(task.code,22,45);
  ctx.fillStyle='#263f51';ctx.font='600 25px sans-serif';ctx.fillText(task.name,22,112,468);
  ctx.font='18px sans-serif';ctx.fillStyle='#526a7b';ctx.fillText(task.role.toUpperCase(),22,147);
  task.labels.forEach((label,i)=>{
   ctx.fillStyle=done?'#288877':task.color;ctx.fillRect(24,175+i*39,16,16);
   ctx.fillStyle='#364f60';ctx.font='19px sans-serif';ctx.fillText(label,56,190+i*39);
  });
  ctx.fillStyle=done?'#268471':'#a66b28';ctx.font='600 17px monospace';ctx.fillText(done?'CHECK COMPLETE':'AWAITING CHECK',24,365);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  return texture;
 },[task,done]);
 useEffect(()=>()=>screen.dispose(),[screen]);
 const cockpit=task.area==='Flight deck';
 const seat=task.role==='Passenger';
 // Seat terminals sit on the existing seat back; other panels are mounted on
 // a console or wall facing the aisle, never introducing invisible obstacles.
 const position: [number,number,number] = seat ? [task.x,1.07,task.z-.2] : cockpit ? [task.x,1.47,task.z] : [Math.sign(task.x)*3.37,1.47,task.z];
 const yaw=seat?0:cockpit?(task.z<-12?0:Math.PI):task.x<0?Math.PI/2:-Math.PI/2;
 return <group position={position} rotation={[0,yaw,0]}>
  <mesh castShadow><boxGeometry args={[.63,.52,.055]}/><meshStandardMaterial color="#788c9c" roughness={.35} metalness={.45}/></mesh>
  <mesh position={[0,.016,.029]}><planeGeometry args={[.56,.42]}/><meshBasicMaterial map={screen} toneMapped={false}/></mesh>
  <mesh position={[.23,-.226,.035]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.011,.011,.018,8]}/><meshStandardMaterial color={done?'#62caae':'#e4b567'} emissive={done?'#379781':'#a67939'} emissiveIntensity={.25}/></mesh>
 </group>;
}
export function RoleCheckStations({completedTasks}:{completedTasks:string[]}) {
 return <group>{checks.map(task=><CheckTerminal key={task.id} task={task} done={completedTasks.includes(task.id)}/>)}</group>;
}
