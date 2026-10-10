import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, PlaneLanding, PlaneTakeoff } from 'lucide-react';
import { BOARDING_DOCUMENTS, BOARDING_ENTRANCE, type Player, type Snapshot } from '../../../shared/protocol';
import { FLIGHT_CONTROL_STATION, hasCabinSight } from '../../../shared/world';
import { session } from '../network/session';
import './journey-operations.css';

type FlightKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const stages = { boarding: 'GATE 04 · BOARDING', takeoff: 'RUNWAY 04 · DEPARTURE', cruise: 'FLIGHT 404 · EN ROUTE', landing: 'RUNWAY 22 · APPROACH', arrived: 'ARRIVAL · NORTH BAY', crashed: 'FLIGHT 404 · EMERGENCY' } as const;

/** Hold controls never persist after blur, panel dismissal or lost pilot access. */
function usePilotInput(enabled: boolean, throttle: number, gearDown: boolean, brakes: boolean) {
 const held = useRef(new Set<FlightKey>()), focused = useRef(!document.hidden);
 const settings = useRef({ enabled, throttle, gearDown, brakes }); settings.current = { enabled, throttle, gearDown, brakes };
 const send = useCallback(() => {
  const s = settings.current;
  if (!focused.current) return;
  session.send('aircraftControl', { pitch: s.enabled ? (held.current.has('ArrowDown') ? .42 : 0) - (held.current.has('ArrowUp') ? .3 : 0) : 0, roll: s.enabled ? (held.current.has('ArrowRight') ? .28 : 0) - (held.current.has('ArrowLeft') ? .28 : 0) : 0, throttle: s.throttle, gearDown: s.gearDown, brakes: s.brakes });
 }, []);
 const press = useCallback((key: FlightKey) => { if (settings.current.enabled) { held.current.add(key); send(); } }, [send]);
 const release = useCallback((key: FlightKey) => { held.current.delete(key); if (settings.current.enabled) send(); }, [send]);
 useEffect(() => {
  if (!enabled) return;
  focused.current = !document.hidden;
  const down = (event: KeyboardEvent) => { if (/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); press(event.code as FlightKey); } };
  const up = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); release(event.code as FlightKey); } };
  const stop = () => { focused.current = false; held.current.clear(); session.send('aircraftControl', { release: true }); };
  const focus = () => { focused.current = true; };
  const visibility = () => { if (document.hidden) stop(); else focus(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
  const timer = window.setInterval(send, 100);
  return () => { held.current.clear(); session.send('aircraftControl', { pitch: 0, roll: 0, throttle: settings.current.throttle, gearDown: settings.current.gearDown, brakes: settings.current.brakes, release: true }); window.clearInterval(timer); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
 }, [enabled, press, release, send]);
 return { press, release };
}

function PilotConsole({ snapshot, disabled }: { snapshot: Snapshot; disabled: boolean }) {
 const op = snapshot.operations;
 const [throttle, setThrottle] = useState(op.throttle), [gearDown, setGearDown] = useState(op.gearDown), [brakes, setBrakes] = useState(op.brakes);
 const flying = op.stage === 'takeoff' || op.stage === 'landing';
 const input = usePilotInput(flying && !disabled, throttle, gearDown, brakes);
 const landing = op.stage === 'landing';
 const keys: [FlightKey, string, string][] = [['ArrowLeft', '←', 'Bank left'], ['ArrowDown', '↓', 'Nose up'], ['ArrowUp', '↑', 'Nose down'], ['ArrowRight', '→', 'Bank right']];
 return <div className="journey-objective">
  <small>YOU HAVE CONTROL · CAPTAIN</small>
  <h2>{landing ? 'Bring them home.' : 'Cleared for takeoff.'}</h2>
  <p>{landing ? 'Line up, lower the gear and ease onto the runway.' : 'Release brakes. Add power, then gently raise the nose.'}</p>
  <div className="journey-horizon" aria-label={`Pitch ${Math.round(op.pitch * 18)} degrees, bank ${Math.round(op.roll * 25)} degrees`}>
   <div className="journey-horizon-world" style={{ transform: `translateY(${op.pitch * 18}px) rotate(${-op.roll * 25}deg)` }}/><span className="journey-horizon-center"/>
  </div>
  <div className="journey-instruments"><div><label>AIRSPEED</label><strong>{Math.round(op.airspeed)}<small>KT</small></strong></div><div><label>ALTITUDE</label><strong>{Math.round(op.altitude)}<small>FT</small></strong></div><div><label>ALIGNMENT</label><strong>{Math.round(Math.abs(op.runwayOffset) * 100)}<small>% OFF</small></strong></div></div>
  <label className="journey-throttle">THRUST <input aria-label="Engine thrust" type="range" min="0" max="1" step=".05" value={throttle} disabled={disabled} onChange={event => setThrottle(Number(event.target.value))}/><strong>{Math.round(throttle * 100)}%</strong></label>
  <div className="journey-controls-row"><button disabled={disabled} className={gearDown ? 'active' : ''} onClick={() => setGearDown(value => !value)}>Gear {gearDown ? 'down' : 'up'}</button><button disabled={disabled} className={brakes ? 'active' : ''} onClick={() => setBrakes(value => !value)}>Brakes {brakes ? 'on' : 'off'}</button></div>
  <div className="journey-flight-keys">{keys.map(([key, symbol, label]) => <button key={key} disabled={disabled} aria-label={label} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.press(key); }} onPointerUp={() => input.release(key)} onPointerCancel={() => input.release(key)} onLostPointerCapture={() => input.release(key)} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); input.press(key); } }} onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); input.release(key); } }} onBlur={() => input.release(key)}><kbd>{symbol}</kbd>{label}</button>)}</div>
  <p className="journey-flight-hint">{landing ? 'Target: 110–150 kt, level wings, gear down. Cut thrust and brake after touchdown.' : 'Raise the nose above 135 kt. Climb to 600 ft and retract the gear.'}</p>
 </div>;
}

/** Compact personal objective, with pilot authority enforced again on server. */
export function JourneyOperations({ snapshot, me, disabled = false }: { snapshot: Snapshot; me?: Player; disabled?: boolean }) {
 const op = snapshot.operations;
 disabled = disabled || !me || me.detained || !!snapshot.experience.players[me.id]?.incapacitated || (op.restraints[me.id] ?? 0) > 0;
 const [reviewed, setReviewed] = useState<string[]>([]);
 useEffect(()=>{setReviewed([]);},[snapshot.roomId,snapshot.phase==='lobby']);
 const roster = me ? op.roster.find(entry => entry.playerId === me.id) : undefined;
 const pilot = !!me && (snapshot.training || me.role === 'Captain');
 const atDesk = !!me && Math.hypot(me.x - BOARDING_DOCUMENTS.x, me.z - BOARDING_DOCUMENTS.z) < BOARDING_DOCUMENTS.radius;
 const atGate = !!me && Math.hypot(me.x - BOARDING_ENTRANCE.x, me.z - BOARDING_ENTRANCE.z) < BOARDING_ENTRANCE.radius;
 const crew = me?.role !== 'Passenger';
 const checklist = crew ? ['Crew manifest received', 'Route and weather reviewed', 'Cabin checks assigned'] : ['Name matches your pass', 'Cabin baggage ready'];
 const action = useCallback(() => {
  if (disabled || !me || op.stage !== 'boarding' || roster?.boarded) return;
  if (!roster?.documentsReceived && atDesk) {
   // Reviewing the desk card needs the cursor even when walking uses pointer lock.
   if(document.pointerLockElement)document.exitPointerLock();
   if(reviewed.length===checklist.length)session.send('boardingAction',{kind:'documents'});
  }
  else if (roster?.documentsReceived && atGate) session.send('boardingAction', { kind: 'board' });
 }, [disabled, me, op.stage, roster, atDesk, atGate, reviewed.length, checklist.length]);
 useEffect(() => { if (snapshot.phase !== 'playing') return; const key = (event: KeyboardEvent) => { if (event.code === 'KeyE' && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) action(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [action, snapshot.phase]);
 if (!me || snapshot.phase === 'lobby' || snapshot.phase === 'meeting') return null;
 const count = op.roster.filter(entry => entry.boarded).length;
 const activePlayers = snapshot.players.filter(player => !player.detained);
 const allAboard = activePlayers.every(player => op.roster.find(entry => entry.playerId === player.id)?.boarded);
 const atControls = !me.weaponDrawn && Math.hypot(me.x - FLIGHT_CONTROL_STATION.x, me.z - FLIGHT_CONTROL_STATION.z) < FLIGHT_CONTROL_STATION.radius && hasCabinSight(me, FLIGHT_CONTROL_STATION);
 const checksReady = snapshot.story.objectives.every(objective => objective.current >= objective.target);
 const allSeated = !snapshot.npcs.some(npc => npc.kind === 'passenger' && npc.alive && (npc.needsSeat || npc.pose !== 'seated'));
 const incident = snapshot.experience.incident !== 'none' || snapshot.experience.pilotCondition !== 'healthy' || !snapshot.npcs.find(npc => npc.id === 'pilot')?.alive || Object.values(snapshot.experience.players).some(player => player.incapacitated) || !!snapshot.sabotage || !!op.bomb;
 const takeoffReason = !allAboard ? 'Wait for every active player to board.' : !checksReady ? 'Complete the remaining departure duties in Tasks.' : !allSeated ? 'Cabin Crew must seat the remaining passengers.' : incident ? 'Resolve the cabin alert before departure.' : !atControls ? 'Walk to the flight deck controls to begin takeoff.' : 'Departure checks complete. You are cleared to take off.';
 const takeoffReady = allAboard && checksReady && allSeated && !incident && atControls;
 if (snapshot.phase === 'ended') return null;
 if (op.stage === 'boarding' && roster?.boarded && !pilot) return null;
 if (op.stage === 'cruise') return pilot && op.landingReady ? <section className="journey-operations"><div className="journey-objective"><small>FLIGHT DECK</small><h2>Prepare for arrival.</h2><p>{incident ? 'Resolve the cabin alert before beginning approach.' : !atControls ? 'Walk to the flight deck controls for your approach.' : 'Cabin ready. Fly the approach and bring everyone home.'}</p><button className="journey-primary" disabled={disabled || !op.landingReady || !atControls || incident} onClick={() => session.send('startLanding')}>Begin approach <PlaneLanding size={16}/></button></div></section> : null;
 return <>
  <div className="journey-stage-indicator"><i/>{stages[op.stage]}</div>
  <section className={`journey-operations ${pilot && (op.stage === 'takeoff' || op.stage === 'landing') ? 'journey-pilot' : ''}`}>
   {op.stage === 'boarding' ? <div className="journey-objective"><small>GATE 04 · {crew ? 'CREW DISPATCH' : 'PASSENGER BOARDING'}</small><h2>{roster?.boarded ? 'Welcome aboard.' : roster?.documentsReceived ? 'Your flight awaits.' : crew ? 'Receive your briefing.' : 'Your boarding pass.'}</h2>
    {roster?.boarded ? <><p>{pilot ? takeoffReason : 'Find your station and complete your departure checks.'}</p><div className="journey-progress"><span style={{ width: `${count / Math.max(1, snapshot.players.length) * 100}%` }}/></div><div className="journey-count"><span>ON BOARD</span><span>{count} / {snapshot.players.length}</span></div>{pilot && <button className="journey-primary" disabled={disabled || !takeoffReady} onClick={() => session.send('startTakeoff')}>Begin takeoff <PlaneTakeoff size={16}/></button>}</> : <>
     <div className="journey-boarding-pass"><small>FLIGHT 404 / {crew ? 'CREW DOCUMENTS' : 'BOARDING PASS'}</small><strong>{me.name}</strong><span>{me.role}</span><i>04</i></div>
     {!roster?.documentsReceived && <><p className="journey-documents-note">{atDesk ? 'Press E to review your documents at the desk.' : 'Walk to the CHECK-IN desk for your documents.'}</p><div className="journey-document-checks">{checklist.map(item => <label key={item}><input type="checkbox" checked={reviewed.includes(item)} disabled={disabled || !atDesk} onChange={event => setReviewed(items => event.target.checked ? [...items, item] : items.filter(value => value !== item))}/>{item}</label>)}</div></>}
     <button className="journey-primary" disabled={disabled || (!roster?.documentsReceived ? !atDesk || reviewed.length !== checklist.length : !atGate)} onClick={action}>{roster?.documentsReceived ? 'Scan pass & board' : 'Collect documents'}<kbd>E</kbd></button>
     <span className="journey-walk-hint">{roster?.documentsReceived ? 'Walk toward the GATE 04 sign and scan your pass.' : 'W A S D to walk · click the gate to look around.'}</span>
    </>}
   </div> : (op.stage === 'takeoff' || op.stage === 'landing') && pilot ? <PilotConsole key={op.stage} snapshot={snapshot} disabled={disabled}/> : <div className={`journey-objective ${op.stage === 'crashed' ? 'journey-crash' : ''}`}><small>{op.stage === 'arrived' ? 'WELCOME TO NORTH BAY' : op.stage === 'crashed' ? 'EMERGENCY DESCENT' : 'FLIGHT DECK IN CONTROL'}</small><h2>{op.stage === 'arrived' ? 'Safely on the ground.' : op.stage === 'crashed' ? 'Brace for impact.' : op.stage === 'landing' ? 'Coming in to land.' : 'The journey begins.'}</h2><p>{op.stage === 'arrived' ? 'Your crew brought the flight home.' : op.stage === 'crashed' ? 'The aircraft is descending toward the sea.' : `Your pilot is ${op.stage === 'landing' ? 'flying the approach' : 'taking off'}. Everyone shares the same flight.`}</p>{(op.stage === 'takeoff' || op.stage === 'landing') && <div className="journey-instruments"><div><label>AIRSPEED</label><strong>{Math.round(op.airspeed)}<small>KT</small></strong></div><div><label>ALTITUDE</label><strong>{Math.round(op.altitude)}<small>FT</small></strong></div><div><label>GEAR</label><strong style={{fontSize:14}}>{op.gearDown ? 'DOWN' : 'UP'}</strong></div></div>}{op.stage === 'arrived' && <Check size={18}/>}</div>}
  </section>
 </>;
}
