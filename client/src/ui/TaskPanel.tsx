import { useEffect, useState } from 'react';
import { Check, X, RotateCcw, CircuitBoard, Navigation, ListChecks, Coffee, ShieldCheck } from 'lucide-react';
import type { TaskChallenge } from '../../../shared/protocol';
import { TASKS } from '../../../shared/world';
import { session } from '../network/session';
const labels:Record<string,string[]>={checklist:['CABIN','DOORS','CREW','ROUTE'],navigation:['NORTH','EAST','SOUTH','WEST'],seatbelts:['ROW 01','ROW 02','ROW 03','ROW 04'],meals:['WATER','TRAY','COFFEE','NAPKIN'],electrical:['RELAY A','RELAY B','RELAY C','RELAY D']};
const icons={checklist:ListChecks,navigation:Navigation,seatbelts:ShieldCheck,meals:Coffee,electrical:CircuitBoard};
export function TaskPanel({challenge,onClose}:{challenge:TaskChallenge;onClose:()=>void}) {
 const [entered,setEntered]=useState<number[]>([]),[mistake,setMistake]=useState(false),[submitted,setSubmitted]=useState(false),[ready,setReady]=useState(false);
 const task=TASKS.find(t=>t.id===challenge.taskId)!;const Icon=icons[task.id];
 useEffect(()=>{const timeout=setTimeout(()=>setReady(true),1400);return()=>clearTimeout(timeout);},[]);
 function press(value:number){if(submitted||!ready)return;if(challenge.sequence[entered.length]!==value){setMistake(true);setEntered([]);return;}setMistake(false);const next=[...entered,value];setEntered(next);if(next.length===4){setSubmitted(true);session.send('completeTask',{taskId:task.id,token:challenge.token,sequence:next});}}
 return <div className="modal-backdrop"><section className="task-panel" role="dialog" aria-modal="true" aria-labelledby="task-title"><div className="panel-top"><span className="eyebrow"><Icon size={15}/> {task.area}</span><button className="icon-button" onClick={onClose} aria-label="Close task"><X size={20}/></button></div><h2 id="task-title">{task.name}</h2><p>{task.hint}</p><div className="sequence" aria-label="Required sequence">{challenge.sequence.map((n,i)=><div key={i} className={i<entered.length?'done':''}><small>0{i+1}</small>{i<entered.length?<Check size={17}/>:labels[task.id][n]}</div>)}</div><div className="task-grid">{labels[task.id].map((label,i)=><button key={label} disabled={!ready||submitted} onClick={()=>press(i)}><span>0{i+1}</span>{label}<div className="switch-light"/></button>)}</div><div className={`task-feedback ${mistake?'warning':''}`}>{submitted?<><Check size={16}/> Sending verification to flight control…</>:mistake?<><RotateCcw size={16}/> Sequence reset. Start from the first step.</>:!ready?'Reading station data…':`${entered.length} / 4 verified · Select the sequence above`}</div><span className="micro">SIMULATED SYSTEM · TRAINING INTERFACE</span></section></div>;
}
