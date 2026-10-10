import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, Wind } from 'lucide-react';
import type { Player, Snapshot, WorldActionKind } from '../../../shared/protocol';
import { FLIGHT_CONTROL_STATION, hasCabinSight, INTERACTION_STATIONS, TASKS } from '../../../shared/world';
import { session } from '../network/session';
import { canPerformDuty, ROLE_BRIEFS } from '../../../shared/duties';
import './flight-story.css';

export type WorldTarget = { kind: WorldActionKind | 'flight-control'; id: string; label: string; detail: string };
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function nearbyWorldTarget(snapshot: Snapshot | null, me?: Player): WorldTarget | undefined {
  if (!snapshot || snapshot.phase !== 'playing' || !me || me.detained || me.weaponDrawn || snapshot.experience.players[me.id]?.incapacitated) return;
  const passenger = snapshot.npcs.filter(n => n.alive && n.kind === 'passenger' && n.needsSeat && distance(me, n) < 2.2 && hasCabinSight(me, n))
    .sort((a, b) => distance(me, a) - distance(me, b))[0];
  if (passenger && canPerformDuty(me.role, 'guide-passenger', snapshot.training)) return { kind: 'guide-passenger', id: passenger.id, label: `Guide passenger to seat ${passenger.seat}`, detail: 'STAY CLOSE · HOLD E' };
  if (canPerformDuty(me.role, 'flight-control', snapshot.training) && snapshot.story.turbulence.active && snapshot.story.turbulence.stability < snapshot.story.turbulence.required && distance(me, FLIGHT_CONTROL_STATION) < FLIGHT_CONTROL_STATION.radius && hasCabinSight(me, FLIGHT_CONTROL_STATION))
    return { kind: 'flight-control', id: 'flight-control', label: 'Take turbulence controls', detail: 'FLIGHT DECK' };
  const station = INTERACTION_STATIONS.find(s => canPerformDuty(me.role, s.kind, snapshot.training) && distance(me, s) < 2.25 && hasCabinSight(me, s)
    && snapshot.story.objectives.some(o => o.id === s.kind && o.current < o.target)
    && (s.kind !== 'cabin-check' || snapshot.story.stage === 'approach')
    && (s.kind !== 'secure-equipment' || snapshot.story.stage === 'turbulence'));
  if (station) return { kind: station.kind, id: station.id, label: station.name, detail: 'WORK IN THE CABIN · HOLD E' };
}

/** Keepalives express an actual held key/button; the server owns completion. */
export function useHeldWorldAction(enabled: boolean) {
  const active = useRef<WorldTarget | null>(null);
  const [holding, setHolding] = useState(false);
  const stop = useCallback(() => {
    if (active.current) session.send('cancelAction');
    active.current = null; setHolding(false);
  }, []);
  const start = useCallback((target: WorldTarget) => {
    if (!enabled || target.kind === 'flight-control' || active.current) return;
    active.current = target; setHolding(true);
    session.send('beginAction', { kind: target.kind, targetId: target.id });
  }, [enabled]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (active.current) session.send('maintainAction'); }, 150);
    const up = (event: KeyboardEvent) => { if (event.code === 'KeyE') stop(); };
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener('keyup', up); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); window.removeEventListener('keyup', up); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hide); stop(); };
  }, [stop]);
  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);
  return { holding, start, stop };
}

export function WorldActionPrompt({ target, snapshot, holding, onStart, onStop }: {
  target: WorldTarget; snapshot: Snapshot; holding: boolean; onStart: () => void; onStop: () => void;
}) {
  const action = snapshot.interactions.find(a => a.playerId === session.id());
  const ratio = action ? Math.min(1, action.progress / action.duration) : 0;
  return <button className="interaction-prompt world-action" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); onStart(); }}
    onPointerUp={onStop} onPointerCancel={onStop} onBlur={onStop} onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); onStart(); } }}
    onKeyUp={onStop} aria-label={target.label}>
    <kbd>E</kbd><span>{holding ? 'KEEP HOLDING · RELEASE TO CANCEL' : target.detail}<strong>{target.label}</strong>
      {target.kind !== 'flight-control' && <span className="hold-track"><i style={{ width: `${ratio * 100}%` }} /></span>}
    </span>
  </button>;
}

export function JourneyAssignments({ snapshot, me }: { snapshot: Snapshot; me?: Player }) {
  if (snapshot.phase === 'lobby') return <div className="journey-assignments"><h2>Your assignment awaits.</h2><p>Public roles are assigned at departure. Your own flight checks will appear here.</p><p className="role-duty-summary">{snapshot.training ? 'Training opens every role and every station.' : 'One player is secretly the terrorist. Each player keeps their public role and its duties.'}</p></div>;
  const mine = snapshot.story.objectives.filter(o => !o.id.startsWith('task:') && (snapshot.training || o.role === me?.role));
  const team = snapshot.story.objectives.filter(o => !snapshot.training && o.role !== me?.role);
  const checks = TASKS.filter(t => snapshot.training || t.role === me?.role);
  const completedChecks = checks.filter(t => snapshot.tasks.some(s => s.id === t.id && s.completed)).length;
  const renderDuty = (o: Snapshot['story']['objectives'][number], own: boolean) => <div className={`journey-duty ${o.current >= o.target ? 'complete' : ''}`} key={o.id}>
    <span className="duty-symbol">{o.current >= o.target ? <Check size={17} /> : <ShieldCheck size={17} />}</span>
    <div><small>{o.role}{own ? ' · YOUR DUTY' : ' · TEAM DUTY'}</small><strong>{o.label}</strong>
      <div className="progress-track"><span style={{ width: `${Math.min(100, o.current / o.target * 100)}%` }} /></div>
    </div><b>{Math.floor(o.current)}/{o.target}</b>
  </div>;
  return <div className="journey-assignments">
    <h2>{snapshot.training ? 'Practice every role.' : `Your ${me?.role ?? 'crew'} duties.`}</h2>
    <p className="role-duty-summary">{snapshot.training ? 'Every duty is available in training. Work through the cabin and practise each team’s stations.' : me ? ROLE_BRIEFS[me.role] : 'Your assignment appears at departure.'}</p>
    <div className="role-progress"><span>{snapshot.training ? 'TRAINING CHECKS' : 'YOUR FLIGHT CHECKS'}</span><strong>{completedChecks} / {checks.length}</strong></div>
    <div className="progress-track"><span style={{width: `${checks.length ? completedChecks / checks.length * 100 : 0}%`}}/></div>
    {mine.length > 0 && <><h3 className="duty-section-label">This stage · {snapshot.story.stage}</h3>{mine.map(o => renderDuty(o, true))}</>}
    {!mine.length && !snapshot.training && <p className="duty-hint">Complete your station checks below and watch for incidents that need your role.</p>}
    <h3 className="duty-section-label">Your stations</h3>
    {checks.map(t => {
      const completed = snapshot.tasks.some(s => s.id === t.id && s.completed);
      return <div className="task-list-row role-check-row" key={t.id}>
        <span className={`task-check ${completed ? 'complete' : ''}`}>{completed ? <Check size={15}/> : <ShieldCheck size={15}/>}</span>
        <div><strong>{t.name}</strong><small>{t.area} · {completed ? 'Verified' : t.stage}</small></div>
      </div>;
    })}
    <p className="duty-hint">{snapshot.training?"Walk to a highlighted station and press E. Training lets you practise every role’s checks.":"Walk to your highlighted station and press E. Your role owns these checks; the rest of the team has different assignments."}</p>
    {team.length > 0 && <details className="team-checklist"><summary>Team checklist · {team.filter(o => o.current >= o.target).length}/{team.length}</summary><p>Read only · teammates complete their own role’s duties.</p>{team.map(o => renderDuty(o, false))}</details>}
  </div>;
}

export function FlightControlsPanel({ snapshot, me }: { snapshot: Snapshot; me?: Player }) {
  const controls = useRef({ roll: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const [yoke, setYoke] = useState({ roll: 0, pitch: 0 });
  const dragging = useRef(false);
  const turbulence = snapshot.story.turbulence;
  const hasOtherOperator = !!turbulence.operatorId && turbulence.operatorId !== session.id();
  const allowed = !!me && canPerformDuty(me.role, 'flight-control', snapshot.training);
  const enabled = !!me && allowed && !me.detained && !me.weaponDrawn && !snapshot.experience.players[me.id]?.incapacitated && turbulence.active && turbulence.stability < turbulence.required && !hasOtherOperator && snapshot.phase === 'playing';
  const update = useCallback((roll: number, pitch: number) => { controls.current = { roll, pitch }; setYoke({ roll, pitch }); }, []);
  useEffect(() => {
    if (!enabled) return;
    let suspended = document.hidden;
    const down = (e: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) { e.preventDefault(); keys.current.add(e.code); } };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const release = () => { keys.current.clear(); dragging.current = false; update(0, 0); };
    const suspend = () => { suspended = true; release(); session.send('flightControl', { roll: 0, pitch: 0, release: true }); };
    const resume = () => { suspended = document.hidden; };
    const visibility = () => { if (document.hidden) suspend(); else resume(); };
    const send = () => {
      if (suspended) return;
      if (!dragging.current) update((Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'))) * .65,
        (Number(keys.current.has('ArrowUp')) - Number(keys.current.has('ArrowDown'))) * .65);
      session.send('flightControl', controls.current);
    };
    const timer = window.setInterval(send, 100); send();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', suspend); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', suspend); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility); suspend(); };
  }, [enabled, update]);
  const setPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    update(Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)), Math.max(-1, Math.min(1, 1 - (event.clientY - box.top) / box.height * 2)));
  };
  const centered = Math.abs(turbulence.roll) < .23 && Math.abs(turbulence.pitch) < .23;
  return <div className="flight-controls-panel">
    <h2>Steady the aircraft.</h2>{!allowed && <p className="role-duty-summary">The Captain operates the flight controls.</p>}<p>Counter the drift. Keep the flight marker inside the centre box for {turbulence.required} seconds.</p>
    <div className={`attitude-instrument ${centered ? 'centered' : ''}`} aria-label={`Aircraft roll ${Math.round(turbulence.roll * 100)}, pitch ${Math.round(turbulence.pitch * 100)}`}>
      <div className="attitude-world" style={{ transform: `translateY(${turbulence.pitch * 55}px) rotate(${-turbulence.roll * 35}deg)` }}><div/><div/></div>
      <div className="attitude-grid"/><div className="attitude-target"/>
      <span className="flight-marker" style={{ transform: `translate(${turbulence.roll * 95}px,${-turbulence.pitch * 70}px)` }}>—◇—</span>
      <span className="instrument-label">ATTITUDE / STABILITY</span>
    </div>
    <div className="stability-readout"><Wind size={17}/><strong>{turbulence.stability.toFixed(1)} / {turbulence.required}s</strong><span>{!turbulence.active ? 'Stable' : hasOtherOperator ? 'Another pilot has control' : centered ? 'Hold this attitude' : 'Counter the drift'}</span></div>
    <div className="progress-track"><span style={{ width: `${turbulence.stability / turbulence.required * 100}%` }}/></div>
    {enabled && <><div className="yoke-pad" role="application" aria-label="Flight yoke. Drag to steer or use arrow keys." tabIndex={0}
      onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setPointer(e); }}
      onPointerMove={e => { if (dragging.current) setPointer(e); }} onPointerUp={() => { dragging.current = false; update(0, 0); }} onPointerCancel={() => { dragging.current = false; update(0, 0); }}>
      <span className="yoke-axis horizontal"/><span className="yoke-axis vertical"/><span className="yoke-grip" style={{ transform: `translate(${yoke.roll * 105}px,${-yoke.pitch * 55}px)` }}>━┳━</span>
    </div><p className="yoke-hint">Drag and hold the yoke · Arrow keys also steer<br/>Move opposite the marker, then release near centre.</p></>}
  </div>;
}
