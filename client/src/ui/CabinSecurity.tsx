import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LockKeyhole, ShieldCheck, Wind } from 'lucide-react';
import type { Player, Secret, Snapshot } from '../../../shared/protocol';
import { hasCabinSight } from '../../../shared/world';
import { session } from '../network/session';
import type { HeldToolKind } from '../scene/HeldTool';
import './cabin-security.css';

const TOOL_NAMES: Record<HeldToolKind,string> = { knife:'Knife', rope:'Rope', bomb:'Sabotage case' };
const inReach=(me:Player,point:{x:number;z:number},range=2)=>Math.hypot(me.x-point.x,me.z-point.z)<range&&hasCabinSight(me,point);
export function nearestToolTarget(snapshot:Snapshot,me?:Player) {
 if(!me)return undefined;
 const players=snapshot.players.filter(p=>p.id!==me.id&&!p.detained&&!snapshot.experience.players[p.id]?.incapacitated&&snapshot.operations.roster.some(entry=>entry.playerId===p.id&&entry.boarded)&&(me.equippedTool!=='rope'||!snapshot.operations.restraints[p.id]));
 return [...players,...(me.equippedTool==='rope'?[]:snapshot.npcs.filter(n=>n.alive))]
 .filter(target=>inReach(me,target,1.8)).sort((a,b)=>Math.hypot(me.x-a.x,me.z-a.z)-Math.hypot(me.x-b.x,me.z-b.z))[0];
}
export function activateEquippedTool(snapshot:Snapshot,me:Player) {
 const target=nearestToolTarget(snapshot,me);
 if(me.equippedTool==='bomb')session.send('useTool');
 else if(target)session.send('useTool',{targetId:target.id});
}

export function ImpostorKit({snapshot,secret,me,disabled=false}:{snapshot:Snapshot;secret:Secret|null;me?:Player;disabled?:boolean}) {
 if(secret?.allegiance!=='saboteur'||!me||snapshot.phase!=='playing')return null;
 const blocked=disabled||me.detained||!!snapshot.experience.players[me.id]?.incapacitated||!!snapshot.operations.restraints[me.id];
 const inventory=secret.inventory??[];
 const target=nearestToolTarget(snapshot,me);
 return <details className="sabotage-controls impostor-kit">
  <summary><LockKeyhole size={13}/> Private kit</summary>
  <p>Concealed tools leave no visual clue. Equipped tools are visible.</p>
  <div className="kit-tools">{inventory.map((tool,index)=><button key={tool} disabled={blocked} aria-pressed={me.equippedTool===tool} onClick={()=>session.send('equipTool',{tool:me.equippedTool===tool?null:tool})}><small>{index+1}</small>{TOOL_NAMES[tool]}</button>)}</div>
  {me.equippedTool&&<div className="kit-equipped"><b>{TOOL_NAMES[me.equippedTool]} equipped</b><button disabled={blocked} onClick={()=>session.send('equipTool',{tool:null})}>Conceal <kbd>Q</kbd></button></div>}
  {me.equippedTool&&<button className="kit-use" disabled={blocked||(me.equippedTool!=='bomb'&&(!target||secret.killCooldown>0))||(me.equippedTool==='bomb'&&(secret.cooldown>0||!!snapshot.operations.bomb))} onClick={()=>activateEquippedTool(snapshot,me)}>{me.equippedTool==='bomb'?'Place sabotage case':secret.killCooldown>0?`Ready in ${secret.killCooldown}s`:target?`${me.equippedTool==='rope'?'Restrain':'Attack'} ${target.name}`:'Move within reach'} <kbd>F</kbd></button>}
  <div className="kit-section"><span>AIRCRAFT SYSTEMS {secret.cooldown>0?`/ ${secret.cooldown}s`:''}</span><div>{([['blackout','Lights'],['comms','Intercom'],['navigation','Navigation']] as const).map(([kind,label])=><button key={kind} disabled={blocked||secret.cooldown>0||!!snapshot.sabotage} onClick={()=>session.send('sabotage',{kind})}>{label}</button>)}<button disabled={blocked||secret.cooldown>0||snapshot.experience.incident!=='none'} onClick={()=>session.send('oxygenCut')}><Wind size={12}/> Oxygen cut</button></div></div>
  <small className="kit-note">Use On board for covert service and equipment damage.</small>
 </details>;
}

type SecurityHold={message:'disarmBomb'|'releaseRestraint';targetId?:string};
function useSecurityHold(enabled:boolean) {
 const current=useRef<SecurityHold|null>(null), [holding,setHolding]=useState(false);
 const stop=useCallback(()=>{if(current.current)session.send(current.current.message,{phase:'cancel',targetId:current.current.targetId});current.current=null;setHolding(false);},[]);
 const start=(target:SecurityHold)=>{if(!enabled||current.current)return;current.current=target;setHolding(true);session.send(target.message,{phase:'begin',targetId:target.targetId});};
 useEffect(()=>{const timer=window.setInterval(()=>{if(current.current)session.send(current.current.message,{phase:'maintain',targetId:current.current.targetId});},150);const hide=()=>{if(document.hidden)stop();};const up=(event:KeyboardEvent)=>{if(event.code==='Space'||event.code==='Enter')stop();};window.addEventListener('blur',stop);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('keyup',up);document.addEventListener('visibilitychange',hide);return()=>{clearInterval(timer);stop();window.removeEventListener('blur',stop);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('keyup',up);document.removeEventListener('visibilitychange',hide);};},[stop]);
 useEffect(()=>{if(!enabled)stop();},[enabled,stop]);
 return {holding,start,stop};
}
export function SecurityInteractions({snapshot,me,disabled=false}:{snapshot:Snapshot;me?:Player;disabled?:boolean}) {
 const active=!!me&&!disabled&&!me.detained&&!snapshot.experience.players[me.id]?.incapacitated&&!snapshot.operations.restraints[me.id]&&snapshot.phase==='playing';
 const hold=useSecurityHold(active);
 const bomb=snapshot.operations.bomb;
 const restrained=Object.keys(snapshot.operations.restraints).map(id=>snapshot.players.find(p=>p.id===id)??snapshot.npcs.find(n=>n.id===id)).find(p=>p&&me&&p.id!==me.id&&inReach(me,p));
 const canDisarm=!!me&&(snapshot.training||me.role==='Engineer'||me.role==='Air Marshal');
 const canRescue=!!me&&(snapshot.training||me.role==='Cabin Crew'||me.role==='Air Marshal');
 const target:SecurityHold|undefined=bomb&&me&&canDisarm&&inReach(me,bomb)?{message:'disarmBomb'}:restrained&&canRescue?{message:'releaseRestraint',targetId:restrained.id}:undefined;
 const label=target?.message==='disarmBomb'?'Secure the sabotage case':`Release ${restrained?.name??'restraint'}`;
 useEffect(()=>hold.stop(),[target?.message,target?.targetId,bomb===null,hold.stop]);
 return <>
  {bomb&&<aside className="security-alert" role="status"><AlertTriangle size={20}/><div><small>CABIN SECURITY</small><strong>Suspicious case · {Math.ceil(bomb.remaining)}s</strong><span>{canDisarm?'Approach the case and hold to secure it.':'Alert the Engineer or Air Marshal.'}</span></div></aside>}
  {me&&snapshot.operations.restraints[me.id]>0&&<div className="restraint-banner"><LockKeyhole size={18}/><span>Restrained · {Math.ceil(snapshot.operations.restraints[me.id])}s<small>Cabin Crew or the Air Marshal can release you.</small></span></div>}
  {target&&active&&<button className="security-hold" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);hold.start(target);}} onPointerUp={hold.stop} onPointerCancel={hold.stop} onBlur={hold.stop} onKeyDown={e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();hold.start(target);}}} onKeyUp={hold.stop}><ShieldCheck size={20}/><span><small>{hold.holding?'KEEP HOLDING':'HOLD TO HELP'}</small><strong>{label}</strong>{target.message==='disarmBomb'&&<progress max={1} value={bomb?.disarmProgress??0}/>}</span></button>}
 </>;
}
