import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, Play, Volume2, X } from 'lucide-react';
import { SAFETY_INSTRUCTIONS, SAFETY_STEP_DURATIONS, type SafetyChallenge, type SafetyInstruction, type Snapshot } from '../../../shared/protocol';
import { session } from '../network/session';
import './safety-briefing.css';

export function SafetyIllustration({ kind }: { kind: SafetyInstruction }) {
  return <svg viewBox="0 0 160 120" fill="none" aria-hidden="true" className={`safety-illustration ${kind}`}>
    <circle cx="80" cy="59" r="51" fill="currentColor" opacity=".055"/>
    <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'seatbelt' ? <><path d="M13 67h45m46 0h43" strokeWidth="15" opacity=".6"/><rect x="50" y="49" width="40" height="36" rx="6" fill="#e3e9e7"/><path d="M60 58h19v17H60z"/><path d="M101 56h20v23h-20l-10-11z" fill="#c1aa73"/><path d="m104 31-9 5 9 5m-9-5h26"/><path d="M46 95h68" opacity=".25"/></>
      : kind === 'oxygen' ? <><path d="M78 17v21c0 8 12 8 12 17"/><path d="M59 48c-6 6-15 19-16 29-1 10 19 21 37 21s38-11 37-21c-1-10-10-23-16-29z" fill="#ede2c4"/><path d="M68 48v-9h23v9m-40 8-12-6m70 6 12-6"/><path d="M63 76c9 9 24 9 34 0"/><path d="M57 48c-8-25 53-25 45 0" opacity=".4"/><circle cx="80" cy="71" r="8" fill="#b99e5e"/></>
      : kind === 'lifevest' ? <><path d="M53 21c-8 6-15 17-18 28l-7 49h45l7-26 7 26h45l-7-49c-3-11-10-22-18-28L91 33H69z" fill="#ecd286"/><path d="M68 23c1 20 23 20 24 0M80 42v25M47 46l-8 42m74-42 8 42M53 57v16m54-16v16"/><path d="M40 86h80" stroke="#738d8d"/><path d="M61 99v11m38-11v11" stroke="#b58168"/></>
      : <><rect x="61" y="26" width="38" height="72" rx="4" fill="#dbe7df"/><path d="M69 89V37h22v52m-64-29h28m-19-9-9 9 9 9m97-9h-28m19-9 9 9-9 9"/><circle cx="80" cy="46" r="4" fill="currentColor"/><path d="m81 57-7 14-5 8m10-14 8 11m-8-15 8 4"/><path d="M47 105h66" opacity=".25"/></>}
    </g>
  </svg>;
}

export function SafetyBriefingPanel({ challenge, error, muted, onEnableSound, onClose }: { challenge: SafetyChallenge; error: string; muted: boolean; onEnableSound: () => void; onClose: () => void }) {
  const [order, setOrder] = useState<SafetyInstruction[]>(challenge.cards);
  const [selected, setSelected] = useState<SafetyInstruction | null>(null);
  const [dragging, setDragging] = useState<SafetyInstruction | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [revision, setRevision] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const pointer = useRef<{ id: SafetyInstruction; x: number; y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('.safety-card-face')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const move = (id: SafetyInstruction, target: number) => {
    setOrder(items => { const next = items.filter(item => item !== id); next.splice(Math.max(0, Math.min(items.length - 1, target)), 0, id); return next; });
    setSelected(id); setSubmitted(false); setRevision(v => v + 1); session.clearError();
  };
  const submit = () => { session.clearError(); setSubmitted(true); session.send('submitSafety', { token: challenge.token, order }); };
  return <section ref={panel} className="safety-briefing" role="dialog" aria-modal="true" aria-labelledby="safety-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="safety-heading"><span className="safety-kicker">FLIGHT 404 / CABIN CREW</span><div className="briefing-header-actions">{muted&&<button className="briefing-audio" onClick={onEnableSound}><Volume2 size={13}/> Enable narration</button>}<button className="icon-button" aria-label="Close safety briefing" onClick={onClose}><X size={19}/></button></div></div>
    <div className="safety-introduction"><div><h2 id="safety-title">A little care.<br/><em>A safer journey.</em></h2><p>Arrange your safety demonstration.</p></div><div className="briefing-itinerary"><span>YOUR BRIEFING ORDER</span><p>Secure yourself. Breathe safely.<br/>Stay afloat. Find your way out.</p></div></div>
    <ol className="safety-card-track" aria-label="Safety demonstration order">
      {order.map((id, index) => { const info = SAFETY_INSTRUCTIONS.find(item => item.id === id)!; return <li key={id} data-safety-position={index}
        className={`safety-card ${selected === id ? 'selected' : ''} ${dragging === id ? 'dragging' : ''}`}>
        <button className="safety-card-face" aria-label={`Select ${info.title}, position ${index + 1}`} aria-pressed={selected === id}
          onPointerDown={event => { if (event.button !== 0) return; pointer.current = {id,x:event.clientX,y:event.clientY,moved:false}; skipClick.current=false; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { const gesture=pointer.current; if(gesture&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8){gesture.moved=true;setDragging(gesture.id);} }}
          onPointerUp={event => { const gesture=pointer.current; pointer.current=null;setDragging(null);if(!gesture?.moved)return;skipClick.current=true;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-safety-position]');if(target&&panel.current?.contains(target))move(gesture.id,Number(target.dataset.safetyPosition)); }}
          onPointerCancel={() => {pointer.current=null;setDragging(null);skipClick.current=false;}}
          onClick={() => { if(skipClick.current){skipClick.current=false;return;}if (selected && selected !== id) move(selected, index); else setSelected(selected === id ? null : id); }}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(id, index + (event.key === 'ArrowLeft' ? -1 : 1)); } }}>
          <span className="safety-card-number">0{index + 1}<GripVertical size={14}/></span><SafetyIllustration kind={id}/><strong>{info.title}</strong><small>{info.description}</small>
        </button>
        <div className="safety-card-move"><button aria-label={`Move ${info.title} earlier`} disabled={index === 0} onClick={() => move(id, index - 1)}><ArrowLeft size={14}/></button><span>MOVE</span><button aria-label={`Move ${info.title} later`} disabled={index === order.length - 1} onClick={() => move(id, index + 1)}><ArrowRight size={14}/></button></div>
      </li>; })}
    </ol>
    <div className="safety-panel-footer"><p role="status" aria-live="polite">{error || (submitted ? 'Checking your briefing…' : selected ? 'Choose another card’s position, or use the arrows.' : 'Drag the cards into order. Arrow buttons work too.')}</p><button className="primary" disabled={submitted && !error} onClick={submit}><Play size={16}/> Begin demonstration</button></div>
    <span className="sr-only" aria-live="polite">{revision > 0 ? `Order: ${order.map(id => SAFETY_INSTRUCTIONS.find(item => item.id === id)!.title).join(', ')}` : ''}</span>
  </section>;
}

const DEMO_CAPTIONS = [
  'Insert the metal fitting into the buckle. Pull the strap snug; lift the flap to release.',
  'Bring the oxygen mask over your nose and mouth. Secure your own mask before helping others.',
  'Place the life vest over your head and secure the straps. Inflate only after leaving the aircraft.',
  'Locate your nearest exit. It may be behind you. Follow the aisle lights and crew instructions.',
];

export function SafetyDemonstrationOverlay({ snapshot }: { snapshot: Snapshot }) {
  const { safety } = snapshot;
  const info = SAFETY_INSTRUCTIONS[safety.step];
  const progress = Math.min(1, safety.elapsed / SAFETY_STEP_DURATIONS[safety.step]);
  return <div className="safety-demonstration" aria-label="Live safety demonstration">
    <div className="demo-title"><span>BEFORE WE TAKE OFF</span><strong>Your cabin crew demonstration</strong></div>
    <div className="demo-caption" role="status"><div className="demo-step-icon"><SafetyIllustration kind={info.id}/></div><div><small>0{safety.step + 1} / 04 · {snapshot.phase === 'meeting' ? 'PAUSED FOR BRIEFING' : 'LIVE IN THE CABIN'}</small><h2>{info.title}</h2><p>{DEMO_CAPTIONS[safety.step]}</p></div></div>
    <div className="demo-chapters">{SAFETY_INSTRUCTIONS.map((item, index) => <div className={index === safety.step ? 'current' : index < safety.step ? 'done' : ''} key={item.id}><span>{index < safety.step ? <Check size={12}/> : `0${index + 1}`}</span><strong>{item.title}</strong><i style={{transform:`scaleX(${index < safety.step ? 1 : index === safety.step ? progress : 0})`}}/></div>)}</div>
  </div>;
}
