import { useEffect, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import type { TaskChallenge } from '../../../shared/protocol';
import { TASKS } from '../../../shared/world';
import { session } from '../network/session';
import './task-panel.css';

const routePoints = [[46,112],[136,51],[235,107],[322,37]];
const dialTargets = [14,38,62,86];

export function TaskPanel({challenge,onClose}:{challenge:TaskChallenge;onClose:()=>void}) {
 const [entered,setEntered]=useState<number[]>([]),[mistake,setMistake]=useState(false),[submitted,setSubmitted]=useState(false),[ready,setReady]=useState(false);
 const [dial,setDial]=useState(50),[selected,setSelected]=useState<number|null>(null);
 const task=TASKS.find(t=>t.id===challenge.taskId);
 useEffect(()=>{
  setEntered([]);setMistake(false);setSubmitted(false);setReady(false);setDial(50);setSelected(null);
  const timeout=setTimeout(()=>setReady(true),1400);return()=>clearTimeout(timeout);
 },[challenge.token]);
 if(!task)return null;
 const station=task;
 function press(value:number){
  if(submitted||!ready||!task)return;
  if(challenge.sequence[entered.length]!==value){setMistake(true);setEntered([]);setSelected(null);return;}
  setMistake(false);const next=[...entered,value];setEntered(next);setSelected(null);
  if(next.length===challenge.sequence.length){setSubmitted(true);session.send('completeTask',{taskId:task.id,token:challenge.token,sequence:next});}
 }
 const current=challenge.sequence[entered.length];
 const matching=task.panel==='match'||task.panel==='supplies';
 const tuning=task.panel==='dial';
 const place=(slot:number,value:number|null)=>{
  if(value===null||slot!==entered.length||!ready||submitted)return;
  press(value);
 };
 const target=dialTargets[current];
 return <div className="modal-backdrop"><section className={`task-panel equipment-task task-${task.id} panel-${task.panel}`} role="dialog" aria-modal="true" aria-labelledby="task-title">
  <div className="panel-top"><span className="eyebrow">{station.code}</span><button className="icon-button" onClick={onClose} aria-label="Close task"><X size={20}/></button></div>
  <h2 id="task-title">{task.name}</h2><p className="task-instruction">{station.hint} {matching?'Drag a card to its slot, or select a card then select the slot.':tuning?'Move the dial, then lock the reading when the needle aligns.':''}</p>
  <div className="work-order" aria-label="Requested check order">{challenge.sequence.map((n,i)=><span key={i} className={i<entered.length?'is-done':i===entered.length?'is-current':''}>{i<entered.length?<Check size={12}/>:<b>{i+1}</b>}{station.labels[n]}</span>)}</div>
  <div className="equipment-face">
   <div className="equipment-heading"><span>{station.code}</span><span className="instrument-led"/>{submitted?'VERIFIED':'CHECK'}</div>
   {task.panel==='route'&&<svg className="route-display" viewBox="0 0 370 155" role="img" aria-label="Flight plan waypoints">
    <defs><pattern id="nav-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#b2c6d1" strokeWidth=".6"/></pattern></defs>
    <rect width="370" height="155" fill="url(#nav-grid)"/>
    <polyline points={challenge.sequence.map(n=>routePoints[n].join(',')).join(' ')} fill="none" stroke="#42799d" strokeWidth="2" strokeDasharray="5 4"/>
    {routePoints.map(([x,y],i)=><g key={i}><path d={`M ${x} ${y-5} l 5 5 -5 5 -5 -5 Z`} fill={entered.includes(i)?'#27867a':'#fff'} stroke="#275777" strokeWidth="2"/><text x={x+10} y={y+4}>{station.labels[i]}</text></g>)}
   </svg>}
   {tuning?<div className="tuning-console">
    <div className="dial-readout"><span>{submitted?'CHECK COMPLETE':station.labels[current]}</span><strong>{String(dial).padStart(2,'0')}</strong><small>SIMULATED TEST SCALE · 0—100</small></div>
    <div className="dial-scale" aria-hidden="true"><span className="dial-target" style={{left:`${target??50}%`}}/><span className="dial-needle" style={{left:`${dial}%`}}/></div>
    <label className="dial-label">{submitted?'All readings verified':`Target reading: ${target}`}<input aria-label={`Tune ${station.labels[current]??'instrument'}`} type="range" min="0" max="100" step="1" value={dial} disabled={!ready||submitted} onChange={e=>{setDial(Number(e.target.value));setMistake(false);}}/></label>
    <button className="primary dial-lock" disabled={!ready||submitted} onClick={()=>{
     if(Math.abs(dial-target)>1){setMistake(true);return;}press(current);setDial(50);
    }}>{submitted?<Check size={15}/>:null}{submitted?'Readings verified':'Lock reading'}</button>
   </div>:matching?<div className="matching-console">
    <div className="manifest-slots" aria-label="Manifest slots">{challenge.sequence.map((value,i)=><button key={i} className={`manifest-slot ${i<entered.length?'filled':''} ${i===entered.length?'current':''}`} disabled={!ready||submitted||i!==entered.length} onClick={()=>place(i,selected)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/plain');if(/^[0-3]$/.test(raw))place(i,Number(raw));}} aria-label={`Slot ${i+1}: ${station.labels[value]}`}>
     <span>{i<entered.length?<Check size={16}/>:String(i+1).padStart(2,'0')}</span><strong>{station.labels[value]}</strong><small>{i<entered.length?'SECURED':i===entered.length?'PLACE HERE':'NEXT SLOT'}</small>
    </button>)}</div>
    <div className="packing-cards" aria-label="Available items">{station.labels.map((label,i)=><button key={label} className={`packing-card ${selected===i?'selected':''}`} disabled={!ready||submitted||entered.includes(i)} draggable={ready&&!submitted&&!entered.includes(i)} onDragStart={e=>{setSelected(i);e.dataTransfer.setData('text/plain',String(i));}} onClick={()=>setSelected(i)} aria-pressed={selected===i}>
     <span className={`cargo-symbol cargo-${task.id==='baggage-stow'?'bag':task.panel==='supplies'?'tray':'card'}`}>{task.panel==='match'?String(i+1).padStart(2,'0'):null}</span>{label}
    </button>)}</div>
   </div>:<div className={`equipment-controls ${task.panel==='checklist'?'checklist-controls':''}`}>
    {station.labels.map((label,i)=>{
     const done=entered.includes(i),active=current===i;
     return <button key={label} className={`equipment-control ${done?'is-verified':''} ${active?'is-next':''}`} disabled={!ready||submitted||done} onClick={()=>press(i)} aria-label={`${station.action} ${label}`} aria-pressed={done}>
      {task.panel==='checklist'?<span className="check-box">{done&&<Check size={19}/>}</span>:
       task.panel==='switches'?<span className="breaker-model"><span className="breaker-lever"/><small>{done?'ON':'TEST'}</small></span>:
       task.panel==='belt'?<span className="belt-model"><span className="belt-strap"/><span className="belt-tongue"/><span className="belt-buckle"/><span className="belt-strap"/></span>:
       <span className="line-select">{String(i+1).padStart(2,'0')}<span>→</span></span>}
      <span className="equipment-control-label">{label}<small>{done?'VERIFIED':station.action.toUpperCase()}</small></span>
      {done&&<Check className="control-check" size={14}/>}
     </button>;
    })}
   </div>}
   <div className="equipment-plate">F404 <span>{station.role}</span><span>{station.area}</span></div>
  </div>
  <div className={`task-feedback ${mistake?'warning':''}`} role="status" aria-live="polite">{submitted?<><Check size={16}/> Verifying with flight control…</>:mistake?<><RotateCcw size={16}/>{tuning?' Align the needle with the target, then lock the reading.':` Check order reset. Begin with ${station.labels[challenge.sequence[0]]}.`}</>:!ready?'Connecting to station…':`${entered.length} / 4 complete · Next: ${station.labels[current]}`}</div>
 </section></div>;
}
