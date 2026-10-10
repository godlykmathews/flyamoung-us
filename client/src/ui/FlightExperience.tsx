import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Coffee, HeartPulse, Moon, Shield, Wind, Wrench, Flame, AlertTriangle, LockKeyhole } from 'lucide-react';
import type { ExperienceActionKind, Player, Secret, Snapshot } from '../../../shared/protocol';
import { EXPERIENCE_ACTION_DURATIONS } from '../../../shared/protocol';
import { EXPERIENCE_STATIONS, hasCabinSight } from '../../../shared/world';
import { session } from '../network/session';
import { SERVICE_ITEMS } from './CabinService';
import './flight-experience.css';

export type ExperienceTarget = { kind: ExperienceActionKind; targetId: string; label: string; detail?: string };
const near = (me: Player, target: { x: number; z: number }, radius = 2.25) => Math.hypot(me.x-target.x, me.z-target.z)<radius && hasCabinSight(me,target);
export function nearbyExperienceTarget(snapshot: Snapshot | null, me?: Player): ExperienceTarget | undefined {
 if (!snapshot || snapshot.phase!=='playing' || !me || me.detained || me.weaponDrawn) return;
 const state=snapshot.experience, personal=state.players[me.id];
 if(personal?.incapacitated)return;
 const threatened=snapshot.players.find(p=>p.id!==me.id&&!p.detained&&p.weaponDrawn&&near(me,p,1.8));
 if(threatened&&(snapshot.training||['Captain','First Officer','Air Marshal'].includes(me.role)))return {kind:'disarm',targetId:threatened.id,label:`Protect cabin · disarm ${threatened.name}`};
 if(state.incident==='decompression'&&!personal?.oxygenMask&&me.z>-9&&me.z<8)return {kind:'use-mask',targetId:me.id,label:'Pull down and fit your oxygen mask'};
 const injured=snapshot.players.find(p=>p.id!==me.id&&state.players[p.id]?.incapacitated&&near(me,p));
 if(injured)return {kind:'rescue-player',targetId:injured.id,label:`Help ${injured.name} recover`};
 if((state.pilotCondition==='poisoned'||snapshot.npcs.some(n=>n.id==='pilot'&&!n.alive))&&near(me,EXPERIENCE_STATIONS.pilot))return {kind:'aid-pilot',targetId:'pilot',label:'Assist the unwell pilot'};
 if(state.incident==='decompression'&&personal?.oxygenMask&&near(me,EXPERIENCE_STATIONS.pressure))return {kind:'repair-pressure',targetId:'pressure',label:'Restore cabin pressure'};
 if(state.incident==='smoke'&&near(me,EXPERIENCE_STATIONS.electrical))return {kind:'extinguish-smoke',targetId:'electrical',label:'Contain the electrical incident'};
 const upset=snapshot.npcs.find(n=>n.alive&&state.agitated.includes(n.id)&&near(me,n));
 if(upset)return {kind:'calm-passenger',targetId:upset.id,label:`Reassure passenger ${upset.seat}`};
 const unmasked=snapshot.players.find(p=>p.id!==me.id&&!p.detained&&!state.players[p.id]?.oxygenMask&&near(me,p));
 if(state.incident==='decompression'&&personal?.oxygenMask&&unmasked)return {kind:'assist-mask',targetId:unmasked.id,label:`Help ${unmasked.name} fit a mask`};
}

/** One active held interaction; release, focus loss and modal transitions cancel it. */
export function useExperienceAction(enabled: boolean) {
 const active=useRef<ExperienceTarget|null>(null);
 const [holding,setHolding]=useState<ExperienceTarget|null>(null);
 const stop=useCallback(()=>{if(active.current)session.send('experienceAction',{phase:'cancel'});active.current=null;setHolding(null);},[]);
 const start=useCallback((target:ExperienceTarget)=>{if(!enabled||active.current)return;session.send('cancelAction');active.current=target;setHolding(target);session.send('experienceAction',{phase:'begin',kind:target.kind,targetId:target.targetId});},[enabled]);
 useEffect(()=>{const timer=window.setInterval(()=>{if(active.current)session.send('experienceAction',{phase:'maintain'});},150);const up=(e:KeyboardEvent)=>{if(['KeyE','Space','Enter'].includes(e.code))stop();};const hide=()=>{if(document.hidden)stop();};window.addEventListener('keyup',up);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hide);return()=>{clearInterval(timer);window.removeEventListener('keyup',up);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hide);stop();};},[stop]);
 useEffect(()=>{if(!enabled)stop();},[enabled,stop]);
 return {start,stop,holding};
}
export type ExperienceController=ReturnType<typeof useExperienceAction>;
export function ExperienceHold({target,snapshot,controller,disabled=false,prompt=false}:{target:ExperienceTarget;snapshot:Snapshot;controller:ExperienceController;disabled?:boolean;prompt?:boolean}) {
 const action=snapshot.experience.actions.find(a=>a.playerId===session.id()&&((a.kind===target.kind&&a.targetId===target.targetId)||(a.kind==='working'&&controller.holding?.kind===target.kind&&controller.holding?.targetId===target.targetId)));
 const progress=action?Math.min(1,action.progress/action.duration):0;
 return <button className={prompt?'interaction-prompt experience-prompt':'experience-hold'} disabled={disabled}
 onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);controller.start(target);}} onPointerUp={controller.stop} onPointerCancel={controller.stop} onBlur={controller.stop}
 onKeyDown={e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();controller.start(target);}}} onKeyUp={controller.stop} aria-label={target.label}>
 {prompt&&<kbd>E</kbd>}<span><small>{action?'KEEP HOLDING':target.detail??`HOLD · ${EXPERIENCE_ACTION_DURATIONS[target.kind]} SECONDS`}</small><strong>{target.label}</strong><span className="experience-track"><span style={{width:`${progress*100}%`}}/></span></span>
 </button>;
}

export function IncidentStatus({snapshot,me,onOpen}:{snapshot:Snapshot;me?:Player;onOpen:()=>void}) {
 const state=snapshot.experience;
 const injured=!!me&&state.players[me.id]?.incapacitated;
 const medical=state.pilotCondition==='poisoned'||snapshot.npcs.some(n=>n.id==='pilot'&&!n.alive);
 if(state.incident==='none'&&!medical&&!injured)return null;
 const title=injured?'Crew assistance needed':state.incident==='decompression'?'Cabin pressure warning':state.incident==='smoke'?'Smoke in the maintenance bay':'Pilot needs assistance';
 const detail=injured?'Stay calm. Another player can help you recover.':state.incident==='decompression'?(me&&state.players[me.id]?.oxygenMask?'Mask fitted. Restore pressure at the aft console.':'Fit your mask first. Then help the cabin.'):state.incident==='smoke'?'Follow the aisle lights to the electrical safety cabinet.':'Go to the flight deck and assist the pilot.';
 return <button className="incident-status" onClick={onOpen}><span className="incident-status-icon">{medical?<HeartPulse size={22}/>:state.incident==='smoke'?<Flame size={22}/>:<Wind size={22}/>}</span><span><small>{injured?'ASSISTANCE':state.incident==='none'?'MEDICAL ALERT':`${Math.ceil(state.remaining)}s · CABIN ALERT`}</small><strong>{title}</strong><span>{detail}</span></span></button>;
}

export function FlightExperiencePanel({snapshot,secret,me,controller}:{snapshot:Snapshot;secret:Secret|null;me?:Player;controller:ExperienceController}) {
 if(!me)return null;
 const state=snapshot.experience, personal=state.players[me.id];
 if(!personal)return null;
 const active=snapshot.phase==='playing'&&!me.detained&&!me.weaponDrawn&&!personal.incapacitated;
 const inCabin=me.z>-9&&me.z<8;
 const immediate=nearbyExperienceTarget(snapshot,me);
 const local=(kind:ExperienceActionKind,label:string):ExperienceTarget=>({kind,targetId:me.id,label});
 const covert:ExperienceTarget[]=[
 {kind:'poison-pilot',targetId:'pilot',label:'Deliver a tainted drink',detail:'COVERT · CARRY COFFEE OR WATER TO THE PILOT'},
 {kind:'damage-pressure',targetId:'pressure',label:'Disrupt cabin pressure',detail:'COVERT · AFT PRESSURE CONSOLE'},
 {kind:'damage-electrical',targetId:'electrical',label:'Damage the electrical cabinet',detail:'COVERT · MAINTENANCE BAY'},
 ];
 const requested=snapshot.npcs.find(n=>n.alive&&n.request&&near(me,n,2.4)&&me.carriedItem&&n.request.item!==me.carriedItem);
 if(requested)covert.unshift({kind:'wrong-order',targetId:requested.id,label:`Serve the wrong item · ${requested.seat}`,detail:'COVERT · UPSET THE PASSENGER'});
 return <div className="flight-experience">
 <div className="experience-heading"><span className="eyebrow">YOUR TIME ON BOARD</span><h2>More than a destination.</h2><p>Settle in, order something, and look after the people sharing your flight.</p></div>
 {me.weaponDrawn&&<p className="experience-order">Conceal your weapon with Q before handling cabin equipment.</p>}
 {immediate&&<div className="experience-priority"><span className="eyebrow">NEARBY · YOU CAN HELP</span><ExperienceHold target={immediate} snapshot={snapshot} controller={controller} disabled={!active}/></div>}
 {(state.pilotCondition!=='healthy'||snapshot.npcs.some(n=>n.id==='pilot'&&!n.alive))&&<div className="experience-note"><HeartPulse size={17}/><span>{state.pilotCondition==='recovering'?'Pilot recovering. Autopilot is holding the route.':'Pilot unwell. Crew assistance needed on the flight deck.'}</span></div>}
 <section><div className="experience-section-title"><h3>Your cabin order</h3><span>{personal.received.length}/4 tried</span></div><div className="experience-menu">{Object.entries(SERVICE_ITEMS).map(([item,{label,Icon}])=><button key={item} disabled={!active||!!personal.order||personal.received.includes(item as keyof typeof SERVICE_ITEMS)} onClick={()=>session.send('requestService',{item})} aria-label={`Order ${label.toLowerCase()}`} className={personal.received.includes(item as keyof typeof SERVICE_ITEMS)?'received':''}><Icon size={25}/><strong>{label}</strong><small>{personal.received.includes(item as keyof typeof SERVICE_ITEMS)?<><Check size={12}/>Enjoyed</>:personal.order?.item===item?'On its way':'Request'}</small></button>)}</div>{personal.order&&<p className="experience-order">{SERVICE_ITEMS[personal.order.item].label} requested · {Math.ceil(personal.order.remaining)}s <span>Crew or the attendant will bring it to you. Stay nearby.</span></p>}</section>
 <section><div className="experience-section-title"><h3>Make yourself comfortable</h3><span>CABIN ACTIVITIES</span></div><div className="experience-activities"><div><LockKeyhole size={18}/><ExperienceHold target={local('fasten-seatbelt',personal.seatbelt?'Seatbelt secured':'Fasten your seatbelt')} snapshot={snapshot} controller={controller} disabled={!active||!inCabin||personal.seatbelt}/></div><div><BookOpen size={18}/><ExperienceHold target={local('read',personal.activity==='reading'?'Reading the flight magazine':'Read the flight magazine')} snapshot={snapshot} controller={controller} disabled={!active||!inCabin||personal.activity==='reading'}/></div><div><Moon size={18}/><ExperienceHold target={local('rest',personal.activity==='resting'?'Resting comfortably':'Take a quiet moment')} snapshot={snapshot} controller={controller} disabled={!active||!inCabin||personal.activity==='resting'}/></div></div><p className="experience-micro">Pause near a seat to settle in. Walking releases your belt and ends a quiet activity.</p></section>
 {state.incident!=='none'&&<section className="experience-priority"><div className="experience-section-title"><h3>Care for the cabin</h3><Shield size={18}/></div><p>{state.incident==='decompression'?'Fit your oxygen mask, then restore the cabin at the aft pressure console. You can help nearby players fit theirs.':'Contain the smoke at the electrical safety cabinet in the maintenance bay.'}</p>{state.incident==='decompression'&&<ExperienceHold target={local('use-mask',personal.oxygenMask?'Oxygen mask fitted':'Fit your oxygen mask')} snapshot={snapshot} controller={controller} disabled={!active||!inCabin||personal.oxygenMask}/>}</section>}
 {secret?.allegiance==='saboteur'&&<section className="experience-covert"><div className="experience-section-title"><h3>Behind the uniform</h3><LockKeyhole size={17}/></div><p>Work discreetly. Nearby players can see you at the station.</p>{covert.map(target=>{const point=target.targetId==='pilot'?EXPERIENCE_STATIONS.pilot:target.targetId==='pressure'?EXPERIENCE_STATIONS.pressure:target.targetId==='electrical'?EXPERIENCE_STATIONS.electrical:requested;return <ExperienceHold key={target.kind} target={target} snapshot={snapshot} controller={controller} disabled={!active||!!secret.cooldown||!point||!near(me,point,2.25)||(target.kind==='poison-pilot'&&((me.carriedItem!=='coffee'&&me.carriedItem!=='water')||state.pilotCondition!=='healthy'||snapshot.npcs.some(n=>n.id==='pilot'&&!n.alive)))||((target.kind==='damage-pressure'||target.kind==='damage-electrical')&&state.incident!=='none')}/>;})}{secret.cooldown>0&&<p className="experience-micro">Covert actions ready in {secret.cooldown}s.</p>}<p className="experience-micro">Draw a weapon with Q to threaten nearby players. Pilots and marshals can intervene; witnesses can call a vote.</p></section>}
 {snapshot.training&&<details className="experience-drills"><summary><Wind size={17}/>Emergency practice</summary><p>Start a practice incident from here, then respond in the cabin.</p><div>{([['weather','Bad weather'],['decompression','Oxygen masks'],['smoke','Electrical smoke'],['medical','Pilot medical']] as const).map(([kind,label])=><button key={kind} disabled={!active||state.incident!=='none'||state.pilotCondition!=='healthy'} onClick={()=>session.send('incidentDrill',{kind})}>{label}</button>)}</div></details>}
 </div>;
}

export function PlayerOrders({snapshot,me}:{snapshot:Snapshot;me?:Player}) {
 const orders=snapshot.players.filter(p=>p.id!==me?.id&&snapshot.experience.players[p.id]?.order);
 if(!orders.length)return null;
 return <section className="player-orders"><span className="eyebrow">PLAYER REQUESTS</span>{orders.map(p=>{const order=snapshot.experience.players[p.id].order!;const Icon=SERVICE_ITEMS[order.item].Icon;return <div key={p.id}><Icon size={18}/><span><strong>{p.name} · {SERVICE_ITEMS[order.item].label}</strong><small>{Math.ceil(order.remaining)}s · {me&&near(me,p,2.4)?'Within reach':'Find them in the cabin'}</small></span><button disabled={!me||me.detained||snapshot.phase!=='playing'||me.carriedItem!==order.item||!near(me,p,2.4)} onClick={()=>session.send('servePlayer',{playerId:p.id,requestId:order.id})}>Serve</button></div>;})}</section>;
}

export function PlayerThreatAction({snapshot,secret,me}:{snapshot:Snapshot;secret:Secret|null;me?:Player}) {
 const target=me?.weaponDrawn&&secret?.allegiance==='saboteur'?snapshot.players.find(p=>p.id!==me.id&&!p.detained&&!snapshot.experience.players[p.id]?.incapacitated&&near(me,p,1.8)):undefined;
 if(!target||!me||snapshot.experience.players[me.id]?.incapacitated)return null;
 return <button className="player-threat-action" disabled={!!secret?.killCooldown} onClick={()=>session.send('attackPlayer',{playerId:target.id})}><AlertTriangle size={16}/>{secret?.killCooldown?`Recovering · ${secret.killCooldown}s`:`Attack ${target.name}`}</button>;
}

export function PassengerMoment({snapshot,me}:{snapshot:Snapshot;me?:Player}) {
 const personal=me?snapshot.experience.players[me.id]:undefined;
 if(!personal||personal.incapacitated||snapshot.phase!=='playing')return null;
 return <>{personal.oxygenMask&&<div className="mask-worn-indicator"><Wind size={14}/>Oxygen mask fitted</div>}{personal.activity==='reading'?<div className="passenger-magazine" aria-label="Reading the flight magazine"><div><span>FLIGHT 404 / JOURNAL</span><strong>Above<br/><em>the ordinary.</em></strong><svg viewBox="0 0 260 110" aria-hidden="true"><path d="M10 85 Q80 0 140 63 T250 20" fill="none" stroke="#74988b" strokeWidth="2" strokeDasharray="4 6"/><circle cx="10" cy="85" r="5" fill="#c7a663"/><circle cx="250" cy="20" r="5" fill="#c7a663"/><path d="m125 54 10 13 8-25-18 12Z" fill="#3b626a"/></svg></div><div><small>THE WINDOW SEAT</small><h3>A world below.</h3><p>Coastlines become ribbons. Cities become constellations. For a little while, let the horizon be your destination.</p><span>Walk to put the magazine away.</span></div></div>:personal.activity==='resting'?<div className="passenger-rest"><Moon size={18}/><span>A quiet moment above the clouds.</span><small>Move when you are ready.</small></div>:null}</>;
}
