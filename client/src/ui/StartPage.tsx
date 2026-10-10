import type { FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import type { SessionState } from '../network/session';
import './start-page.css';

interface StartPageProps {
  name: string;
  setName: (name: string) => void;
  code: string;
  setCode: (code: string) => void;
  joining: boolean;
  setJoining: (joining: boolean) => void;
  busy: boolean;
  connectionStatus: SessionState['connectionStatus'];
  onConnect: (mode: 'create' | 'join' | 'training') => void;
  onCancelConnection: () => void;
  onHelp: () => void;
}

export function StartPage({ name, setName, code, setCode, joining, setJoining, busy, connectionStatus, onConnect, onCancelConnection, onHelp }: StartPageProps) {
  const busyLabel = connectionStatus === 'waking' ? 'Waking server…' : connectionStatus === 'boarding' ? 'Boarding…' : 'Connecting…';
  const statusMessage = connectionStatus === 'waking'
    ? 'Waking flight server… This can take about a minute.'
    : connectionStatus === 'boarding' ? 'Preparing your flight…' : 'Connecting to flight server…';
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && (!joining || /^\d{4}$/.test(code))) onConnect(joining ? 'join' : 'create');
  }

  return (
    <section className="start-page" aria-label="Flight 404 boarding">
      <header className="start-header">
        <div className="start-brand" aria-label="Flight 404">
          <svg viewBox="0 0 36 28" aria-hidden="true"><path d="M2 8h11l5 12 5-12h11L18 27Z"/><path d="m18 1 3 7h-6Z"/></svg>
          <span>F404</span>
        </div>
        <button className="start-controls" type="button" onClick={onHelp}><SlidersHorizontal size={14} aria-hidden="true"/>Controls</button>
      </header>

      <svg className="start-flight-path" viewBox="0 0 1000 720" fill="none" aria-hidden="true">
        <path d="M380 630C670 650 970 475 920 245C890 105 686 114 722 221"/>
        <circle cx="380" cy="630" r="5"/><circle cx="722" cy="221" r="5"/>
      </svg>

      <div className="start-menu">
        <div className="start-heading">
          <h1 className="start-title"><span className="start-title-word">FLIGHT</span><span className="start-title-number">404<span className="start-title-stop" aria-hidden="true">.</span></span></h1>
          <p className="start-tagline">Trust your crew.</p>
        </div>

        <form className="start-ticket" onSubmit={submit} aria-busy={busy}>
          <div className="start-ticket-top"><span>BOARDING PASS</span><span className="start-ticket-mark" aria-hidden="true">F / 404</span></div>
          <div className="start-mode" role="group" aria-label="Flight options">
            <button type="button" aria-pressed={!joining} onClick={()=>setJoining(false)} disabled={busy}>Create</button>
            <button type="button" aria-pressed={joining} onClick={()=>setJoining(true)} disabled={busy}>Join</button>
          </div>
          <div className="start-fields">
            <label className="start-label" htmlFor="callsign">Your name</label>
            <input
              className="start-input" id="callsign" name="callsign" maxLength={18}
              placeholder="Enter your name" autoComplete="nickname" value={name}
              onChange={event=>setName(event.target.value)} disabled={busy}
            />
            {joining && <div className="start-code-field">
              <label className="start-label" htmlFor="flight-code">Flight code</label>
              <input
                className="start-input start-code-input" id="flight-code" name="flight-code"
                placeholder="0000" aria-label="4-digit flight code" inputMode="numeric" pattern="[0-9]{4}"
                maxLength={4} autoComplete="off" autoCapitalize="none" spellCheck={false}
                value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,4))}
                disabled={busy} autoFocus
              />
            </div>}
            <button className="start-primary" type="submit" disabled={busy||(joining&&!/^\d{4}$/.test(code))}>
              <span>{busy?busyLabel:joining?'Join flight':'Create flight'}</span>
              {busy?<span className="start-spinner" aria-hidden="true"/>:<ArrowRight size={19} aria-hidden="true"/>}
            </button>
          </div>
          <div className="start-ticket-stub">
            <button className="start-solo" type="button" onClick={()=>onConnect('training')} disabled={busy}>Solo practice<ArrowUpRight size={14} aria-hidden="true"/></button>
            <span className="start-barcode" aria-hidden="true"/>
          </div>
        </form>
        {busy && <div className="start-connection">
          <p role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
          {(connectionStatus==='connecting'||connectionStatus==='waking')&&<button className="start-cancel-connection" type="button" onClick={onCancelConnection}>Cancel connection</button>}
        </div>}
      </div>
      <footer className="start-footer"><span>3–10 players<span className="start-footer-divider"/>One secret</span><span className="start-flight-signature" aria-hidden="true"><span/>THE CABIN AWAITS</span></footer>
    </section>
  );
}
