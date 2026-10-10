import { useEffect, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import type { TaskChallenge } from '../../../shared/protocol';
import { TASKS } from '../../../shared/world';
import { session } from '../network/session';
import './task-panel.css';

const stations = {
 checklist: { code:'CREW / STATUS', labels:['Cabin secure','Door indicators','Crew stations','Flight briefing'], action:'Confirm', instruction:'Review the crew checklist, then confirm each item in the requested order.' },
 navigation: { code:'FMS / ROUTE', labels:['NOVA','KILO','LIMA','ECHO'], action:'Verify', instruction:'Cross-check the flight-plan legs on the navigation display. Select each waypoint in order.' },
 seatbelts: { code:'CABIN / SAFETY', labels:['Row 01','Row 02','Row 03','Row 04'], action:'Secure', instruction:'Inspect the indicated row, then click its buckle to secure the lap belt.' },
 meals: { code:'GALLEY / SERVICE', labels:['Water','Meal tray','Coffee','Cutlery'], action:'Stow', instruction:'Load the service cart in the requested order. Each item locks into its compartment.' },
 electrical: { code:'ELEC / CABIN BUS', labels:['Cabin lights','Galley supply','Seat power','Crew intercom'], action:'Check', instruction:'Check the four cabin circuits in the requested order. Switches illuminate after verification.' },
} as const;
const routePoints = [[46,112],[136,51],[235,107],[322,37]];

export function TaskPanel({challenge,onClose}:{challenge:TaskChallenge;onClose:()=>void}) {
 const [entered,setEntered]=useState<number[]>([]),[mistake,setMistake]=useState(false),[submitted,setSubmitted]=useState(false),[ready,setReady]=useState(false);
 const task=TASKS.find(t=>t.id===challenge.taskId)!;
 const station=stations[task.id];
 useEffect(()=>{const timeout=setTimeout(()=>setReady(true),1400);return()=>clearTimeout(timeout);},[]);
 function press(value:number){
  if(submitted||!ready)return;
  if(challenge.sequence[entered.length]!==value){setMistake(true);setEntered([]);return;}
  setMistake(false);const next=[...entered,value];setEntered(next);
  if(next.length===challenge.sequence.length){setSubmitted(true);session.send('completeTask',{taskId:task.id,token:challenge.token,sequence:next});}
 }
 const current=challenge.sequence[entered.length];
 return <div className="modal-backdrop"><section className={`task-panel equipment-task task-${task.id}`} role="dialog" aria-modal="true" aria-labelledby="task-title">
  <div className="panel-top"><span className="eyebrow">{station.code}</span><button className="icon-button" onClick={onClose} aria-label="Close task"><X size={20}/></button></div>
  <h2 id="task-title">{task.name}</h2><p className="task-instruction">{station.instruction}</p>
  <div className="work-order" aria-label="Requested check order">{challenge.sequence.map((n,i)=><span key={i} className={i<entered.length?'is-done':i===entered.length?'is-current':''}>{i<entered.length?<Check size={12}/>:<b>{i+1}</b>}{station.labels[n]}</span>)}</div>
  <div className="equipment-face">
   <div className="equipment-heading"><span>{task.id==='navigation'?'ACTIVE FLIGHT PLAN':task.id==='electrical'?'CABIN DISTRIBUTION':task.id==='meals'?'SERVICE CART':task.id==='seatbelts'?'SEAT RESTRAINTS':'CREW CHECKLIST'}</span><span className="instrument-led"/>{submitted?'VERIFIED':'CHECK'}</div>
   {task.id==='navigation'&&<svg className="route-display" viewBox="0 0 370 155" role="img" aria-label="Flight plan waypoints">
    <defs><pattern id="nav-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#b2c6d1" strokeWidth=".6"/></pattern></defs>
    <rect width="370" height="155" fill="url(#nav-grid)"/>
    <polyline points={challenge.sequence.map(n=>routePoints[n].join(',')).join(' ')} fill="none" stroke="#42799d" strokeWidth="2" strokeDasharray="5 4"/>
    {routePoints.map(([x,y],i)=><g key={i}><path d={`M ${x} ${y-5} l 5 5 -5 5 -5 -5 Z`} fill={entered.includes(i)?'#27867a':'#fff'} stroke="#275777" strokeWidth="2"/><text x={x+10} y={y+4}>{station.labels[i]}</text></g>)}
   </svg>}
   <div className={`equipment-controls ${task.id==='checklist'?'checklist-controls':''}`}>
    {station.labels.map((label,i)=>{
     const done=entered.includes(i),active=current===i;
     return <button key={label} className={`equipment-control ${done?'is-verified':''} ${active?'is-next':''}`} disabled={!ready||submitted} onClick={()=>press(i)} aria-label={`${station.action} ${label}`} aria-pressed={done}>
      {task.id==='checklist'?<span className="check-box">{done&&<Check size={19}/>}</span>:
       task.id==='electrical'?<span className="breaker-model"><span className="breaker-lever"/><small>{done?'ON':'TEST'}</small></span>:
       task.id==='seatbelts'?<span className="belt-model"><span className="belt-strap"/><span className="belt-tongue"/><span className="belt-buckle"/><span className="belt-strap"/></span>:
       task.id==='meals'?<span className={`supply-model supply-${i}`}><span/><span/><span/></span>:
       <span className="line-select">{String(i+1).padStart(2,'0')}<span>→</span></span>}
      <span className="equipment-control-label">{label}<small>{done?(task.id==='meals'?'STOWED':task.id==='seatbelts'?'SECURED':'VERIFIED'):task.id==='electrical'?'115 V · AC':task.id==='navigation'?'FLIGHT PLAN LEG':station.action.toUpperCase()}</small></span>
      {done&&<Check className="control-check" size={14}/>}
     </button>;
    })}
   </div>
   <div className="equipment-plate">F404 <span>{station.code}</span><span>01—04</span></div>
  </div>
  <div className={`task-feedback ${mistake?'warning':''}`} role="status" aria-live="polite">{submitted?<><Check size={16}/> Verifying with flight control…</>:mistake?<><RotateCcw size={16}/> Check order reset. Begin with {station.labels[challenge.sequence[0]]}.</>:!ready?'Connecting to station…':`${entered.length} / 4 complete · Next: ${station.labels[current]}`}</div>
 </section></div>;
}
