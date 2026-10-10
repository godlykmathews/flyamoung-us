import type { FormEvent } from 'react';
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
      <div className="start-menu">
        <h1 className="start-title">FLIGHT <span>404</span></h1>
        <p className="start-tagline">Trust your crew.</p>

        <form className="start-form" onSubmit={submit} aria-busy={busy}>
          <label className="start-label" htmlFor="callsign">Your name</label>
          <input
            className="start-input"
            id="callsign"
            name="callsign"
            maxLength={18}
            placeholder="Enter your name"
            autoComplete="nickname"
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={busy}
          />

          {joining && (
            <div className="start-code-field">
              <label className="start-label" htmlFor="flight-code">Flight code</label>
              <input
                className="start-input start-code-input"
                id="flight-code"
                name="flight-code"
                placeholder="4-digit code"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0,4))}
                disabled={busy}
                autoFocus
              />
            </div>
          )}

          <div className="start-actions">
            <button className="start-primary" type="submit" disabled={busy || (joining && !/^\d{4}$/.test(code))}>
              {busy ? busyLabel : joining ? 'Join flight' : 'Create flight'}
            </button>
            <button className="start-secondary" type="button" onClick={() => setJoining(!joining)} disabled={busy}>
              {joining ? 'Cancel' : 'Join flight'}
            </button>
          </div>
          <button className="start-solo" type="button" onClick={() => onConnect('training')} disabled={busy}>Solo practice</button>
        </form>
        {busy && (
          <div className="start-connection">
            <p role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
            {(connectionStatus === 'connecting' || connectionStatus === 'waking') && (
              <button className="start-cancel-connection" type="button" onClick={onCancelConnection}>Cancel connection</button>
            )}
          </div>
        )}
      </div>
      <button className="start-controls" type="button" onClick={onHelp}>Controls</button>
    </section>
  );
}
