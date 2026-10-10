import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../../shared/protocol';

// These are game announcements, not transcripts of user-supplied recordings.
const LINES: Record<string, string> = {
  welcome: 'Welcome aboard Flight 404. Crew, prepare the cabin for departure.',
  service: 'Cabin service may begin. Please remain seated while the crew assists you.',
  turbulence: 'We are entering turbulence. Please fasten your seatbelt. Crew, secure the cabin.',
  secure: 'The aircraft is stable. Thank you for remaining seated.',
  approach: 'We are preparing to land. Crew, complete the final cabin inspection.',
  emergency: 'Crew, attend to the system alert. Passengers, please remain calm and seated.',
  landed: 'Flight 404 has arrived safely. Thank you for flying with us.',
  safety: 'Cabin crew, prepare the safety demonstration at the front of the aircraft.',
  demonstration: 'Please give your attention to the cabin crew for the safety demonstration.',
  pressure: 'Cabin pressure alert. Put on your oxygen mask. Crew, attend to the pressure system.',
  smoke: 'Cabin smoke alert. Stay clear of the affected area and follow crew instructions.',
  medical: 'Medical assistance is needed in the cockpit. Crew, attend to the pilot.',
  recovery: 'The cabin alert is resolved. Crew, check that everyone is comfortable.',
};
const SAFETY_LINES = [
  'Seatbelt · Fasten the buckle, then pull the strap snugly across your lap.',
  'Oxygen · Bring the mask over your nose and mouth; fit your own mask first.',
  'Life vest · Locate the vest beneath your seat. Inflate only outside the aircraft.',
  'Exits · Follow the crew and the floor lighting to your nearest available exit.',
];

type Atmosphere = { weather: number; pressure: number };
type CabinSound = { context: AudioContext; update: (atmosphere: Atmosphere) => void; effect: (cue: 'maskDrop' | 'warning' | 'seatbeltChime') => void; close: () => void };

// A single context owns the quiet engine bed, weather and pressure layers. Only
// the gains change with snapshots; incoming network frames cannot stack loops.
function createCabinSound(files: Record<string, string>, initial: Atmosphere): CabinSound {
  const context = new AudioContext();
  let disposed = false;
  let effectSource: AudioBufferSourceNode | null = null;
  const effectTones = new Set<OscillatorNode>();
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const sources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * .2;
  const layer = (type: BiquadFilterType, frequency: number, volume: number) => {
    const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
    const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency;
    const gain = context.createGain(); gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(context.destination); source.start(); sources.push(source);
    return { source, gain, filter };
  };
  layer('lowpass', 260, .18);
  const weather = layer('lowpass', 190, 0);
  const pressure = layer('highpass', 950, 0);
  const engine = context.createOscillator(); engine.type = 'sine'; engine.frequency.value = 68;
  const engineGain = context.createGain(); engineGain.gain.value = .012;
  engine.connect(engineGain).connect(context.destination); engine.start(); sources.push(engine);
  const recordedWeather = context.createGain(); recordedWeather.gain.value = 0; recordedWeather.connect(context.destination);
  let weatherRecordingReady = false;
  let current = initial;
  const ramp = (gain: GainNode, value: number, seconds = .5) => {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(value, context.currentTime, seconds);
  };
  const update = (next: Atmosphere) => {
    current = next;
    ramp(weather.gain, weatherRecordingReady ? 0 : next.weather * .29);
    ramp(recordedWeather, weatherRecordingReady ? next.weather * .2 : 0);
    ramp(pressure.gain, next.pressure * .075, .3);
    weather.filter.frequency.setTargetAtTime(190 + next.weather * 160, context.currentTime, .4);
  };
  const decode = (url: string) => {
    if (!buffers.has(url)) buffers.set(url, fetch(url).then(response => response.ok ? response.arrayBuffer() : null)
      .then(bytes => bytes ? context.decodeAudioData(bytes) : null).catch(() => null));
    return buffers.get(url)!;
  };
  const generatedEffect = (cue: 'maskDrop' | 'warning' | 'seatbeltChime') => {
    if (disposed) return;
    if (cue === 'maskDrop') {
      effectSource?.stop();
      const source = context.createBufferSource(); source.buffer = noise;
      const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1350;
      const gain = context.createGain(); const start = context.currentTime;
      gain.gain.setValueAtTime(.001, start); gain.gain.linearRampToValueAtTime(.24, start + .02);
      gain.gain.exponentialRampToValueAtTime(.001, start + .5);
      source.connect(filter).connect(gain).connect(context.destination); source.start(); source.stop(start + .55); effectSource = source;
      source.onended = () => { if (effectSource === source) effectSource = null; source.disconnect(); filter.disconnect(); gain.disconnect(); };
      return;
    }
    const frequencies = cue === 'warning' ? [440, 554] : [660, 880];
    for (const [index, frequency] of frequencies.entries()) {
      const tone = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + index * .22;
      tone.frequency.value = frequency; gain.gain.setValueAtTime(.001, start);
      gain.gain.linearRampToValueAtTime(.035, start + .025); gain.gain.exponentialRampToValueAtTime(.001, start + .35);
      tone.connect(gain).connect(context.destination); tone.start(start); tone.stop(start + .4);
      effectTones.add(tone);
      tone.onended = () => { effectTones.delete(tone); tone.disconnect(); gain.disconnect(); };
    }
  };
  let effectToken = 0;
  const effect: CabinSound['effect'] = cue => {
    const token = ++effectToken;
    effectSource?.stop(); effectSource = null;
    effectTones.forEach(tone => tone.stop()); effectTones.clear();
    const url = files[cue];
    if (!url) { generatedEffect(cue); return; }
    void decode(url).then(buffer => {
      if (disposed || token !== effectToken) return;
      if (!buffer) { generatedEffect(cue); return; }
      effectSource?.stop();
      const source = context.createBufferSource(); source.buffer = buffer;
      const gain = context.createGain(); gain.gain.value = .45;
      source.connect(gain).connect(context.destination); source.start(); source.stop(context.currentTime + Math.min(buffer.duration, 8)); effectSource = source;
      source.onended = () => { if (effectSource === source) effectSource = null; source.disconnect(); gain.disconnect(); };
    });
  };
  if (files.weatherLoop) void decode(files.weatherLoop).then(buffer => {
    if (disposed || !buffer) return;
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.connect(recordedWeather); source.start(); sources.push(source); weatherRecordingReady = true; update(current);
  });
  update(initial);
  void context.resume().catch(() => {});
  return {
    context, update, effect,
    close: () => {
      if (disposed) return;
      disposed = true; effectToken++;
      effectSource?.stop(); effectSource = null;
      effectTones.forEach(tone => tone.stop()); effectTones.clear();
      sources.forEach(source => { source.stop(); source.disconnect(); });
      void context.close().catch(() => {});
    },
  };
}

export function useFlightAudio(snapshot: Snapshot | null, muted: boolean) {
  const [caption, setCaption] = useState('');
  const [manifestReady, setManifestReady] = useState(false);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const voices = useRef<Record<string, string>>({});
  const sound = useRef<CabinSound | null>(null);
  const playing = useRef<HTMLAudioElement | null>(null);
  const reportedFailures = useRef(new Set<string>());
  const cancelClip = useRef<(() => void) | null>(null);
  const sequence = useRef(0);
  const clearCaption = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previous = useRef({ room: '', phase: '', stage: '', sabotage: '', active: false, safety: '', step: -1, muted: true, ready: false, visible: true, incident: 'none', masks: false, pilot: 'healthy', seatbelt: false });
  const lastCue = useRef({ cue: '', at: 0 });
  const latestMuted = useRef(muted);
  latestMuted.current = muted || !visible;
  const atmosphere = {
    weather: snapshot?.story.turbulence.active ? .6 + .4 * (1 - Math.min(1, Math.max(0, snapshot.story.turbulence.stability / Math.max(1, snapshot.story.turbulence.required)))) : 0,
    pressure: snapshot?.experience?.incident === 'decompression' ? Math.max(.25, snapshot.experience.severity) : 0,
  };
  const currentAtmosphere = useRef(atmosphere); currentAtmosphere.current = atmosphere;
  const audible = !muted && visible && snapshot?.phase === 'playing';

  const stopPlayback = useCallback(() => {
    sequence.current++;
    cancelClip.current?.();
    cancelClip.current = null;
    playing.current?.pause();
    playing.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/voice/manifest.json')
      .then(response => response.ok ? response.json() : {})
      .then(data => {
        if (!active) return;
        voices.current = Object.fromEntries(Object.entries(data ?? {}).filter((entry): entry is [string, string] =>
          typeof entry[1] === 'string' && /^\/voice\/[^?#]+\.(mp3|m4a|ogg|wav)$/i.test(entry[1])));
        setManifestReady(true);
      })
      .catch(() => { if (active) setManifestReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!audible) { stopPlayback(); return; }
    const cabin = createCabinSound(voices.current, currentAtmosphere.current);
    sound.current = cabin;
    return () => { stopPlayback(); cabin.close(); if (sound.current === cabin) sound.current = null; };
  }, [audible, manifestReady, stopPlayback]);

  useEffect(() => {
    sound.current?.update(atmosphere);
  }, [atmosphere.weather, atmosphere.pressure]);

  const playCue = useCallback((cue: string, offset = 0) => {
    stopPlayback();
    if (latestMuted.current) return;
    const token = sequence.current;
    const current = () => token === sequence.current && !latestMuted.current;
    const playClip = (url: string, isVoice = false, startAt = 0) => new Promise<boolean>(resolve => {
      if (!current()) { resolve(false); return; }
      const clip = new Audio(url);
      clip.preload = 'auto';
      clip.hidden = true;
      clip.setAttribute('aria-label', isVoice ? `Cabin narration: ${cue === 'demonstration' ? 'seatbelt demonstration' : cue}` : 'Cabin attention chime');
      document.body.append(clip);
      let finished = false;
      let timeout: ReturnType<typeof setTimeout>;
      const reportFailure = (reason: string) => {
        if (!current() || reportedFailures.current.has(url)) return;
        reportedFailures.current.add(url);
        console.warn(`Cabin audio could not play ${url}: ${reason}. Captions remain available.`);
      };
      const finish = (success: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clip.onended = clip.onerror = clip.onloadedmetadata = null;
        clip.pause();
        clip.remove();
        if (playing.current === clip) { playing.current = null; cancelClip.current = null; }
        resolve(success);
      };
      clip.volume = .8;
      clip.onended = () => finish(true);
      clip.onerror = () => { reportFailure(`media error ${clip.error?.code ?? 'unknown'}`); finish(false); };
      clip.onloadedmetadata = () => {
        if (!Number.isFinite(clip.duration)) return;
        if (startAt >= clip.duration) { finish(false); return; }
        if (startAt > 0) clip.currentTime = startAt;
        clearTimeout(timeout);
        timeout = setTimeout(() => finish(false), Math.min(120_000, (clip.duration - startAt + 3) * 1000));
        if (isVoice && current()) {
          clearTimeout(clearCaption.current);
          clearCaption.current = setTimeout(() => setCaption(''), (clip.duration - startAt + 1) * 1000);
        }
      };
      timeout = setTimeout(() => finish(false), 30_000);
      playing.current = clip;
      cancelClip.current = () => finish(false);
      if (startAt > 0) clip.currentTime = startAt;
      void clip.play().catch(error => {
        if (error?.name !== 'AbortError') reportFailure(error?.name || 'playback rejected');
        finish(false);
      });
    });
    const generatedChime = async () => {
      const context = sound.current?.context;
      if (!context || context.state === 'closed' || !current()) return;
      for (const [i, frequency] of [660, 880].entries()) {
        const tone = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + i * .24;
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.05, start + .025);
        gain.gain.exponentialRampToValueAtTime(.001, start + .4);
        tone.connect(gain).connect(context.destination); tone.start(start); tone.stop(start + .45);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      }
      await new Promise(resolve => setTimeout(resolve, 720));
    };
    void (async () => {
      // The seatbelt performance starts immediately so the 13.6-second recording
      // stays inside its synchronized 14.5-second demonstration step.
      if (!['demonstration', 'pressure', 'smoke', 'medical'].includes(cue)) {
        const chime = voices.current.chime;
        if (!chime || !await playClip(chime)) await generatedChime();
      }
      if (!current()) return;
      let voice: string | undefined = voices.current[cue];
      if (cue === 'demonstration') voice = voices.current.seatbelt ?? voices.current.safety;
      if (cue === 'safety') voice = undefined; // Chime while arranging, no narration yet.
      // The supplied clip explains fastening a belt, not a turbulence warning.
      if (cue === 'turbulence' && voice === voices.current.seatbelt) voice = undefined;
      if (voice) await playClip(voice, true, offset);
    })();
  }, [stopPlayback]);

  useEffect(() => {
    if (!snapshot) {
      previous.current = { room: '', phase: '', stage: '', sabotage: '', active: false, safety: '', step: -1, muted, ready: manifestReady, visible, incident: 'none', masks: false, pilot: 'healthy', seatbelt: false };
      lastCue.current = { cue: '', at: 0 };
      clearTimeout(clearCaption.current); setCaption(''); stopPlayback(); return;
    }
    const old = previous.current;
    const stage = snapshot.story.stage;
    const safety = snapshot.safety.status;
    const step = snapshot.safety.step;
    const incident = snapshot.experience?.incident ?? 'none';
    const masks = snapshot.experience?.masksDeployed ?? false;
    const pilot = snapshot.experience?.pilotCondition ?? 'healthy';
    const seatbelt = snapshot.story.seatbeltSign;
    let cue = '';
    if (snapshot.phase === 'playing') {
      if (incident !== 'none' && incident !== old.incident) cue = incident === 'decompression' ? 'pressure' : 'smoke';
      else if (pilot === 'poisoned' && pilot !== old.pilot) cue = 'medical';
      else if (old.incident !== 'none' && incident === 'none') cue = 'recovery';
      else if (old.pilot === 'poisoned' && pilot === 'recovering') cue = 'recovery';
      else if (old.room !== snapshot.roomId || old.phase === 'lobby') cue = 'welcome';
      else if (safety === 'arranging' && old.safety !== safety) cue = 'safety';
      else if (safety === 'demonstrating' && step === 0 && (old.safety !== safety || old.phase === 'meeting')) cue = 'demonstration';
      else if (old.stage !== stage) cue = stage === 'departure' ? 'welcome' : stage;
      else if (!old.active && snapshot.story.turbulence.active) cue = 'turbulence';
      else if (old.active && !snapshot.story.turbulence.active) cue = 'secure';
      else if (snapshot.sabotage && old.sabotage !== snapshot.sabotage) cue = 'emergency';
      if (audible) {
        if (masks && !old.masks) sound.current?.effect('maskDrop');
        else if (['pressure', 'smoke', 'medical'].includes(cue)) sound.current?.effect('warning');
        else if (seatbelt && !old.seatbelt && !cue) sound.current?.effect('seatbeltChime');
      }
      if (safety === 'demonstrating' && step !== 0 && old.step === 0 && lastCue.current.cue === 'demonstration') {
        stopPlayback(); lastCue.current = { cue: '', at: 0 };
      }
      if ((old.safety === 'arranging' || old.safety === 'demonstrating') && safety === 'idle') {
        stopPlayback(); clearTimeout(clearCaption.current); setCaption('');
        lastCue.current = { cue: '', at: 0 };
      }
    } else if (snapshot.phase === 'ended' && old.phase !== 'ended' && snapshot.winner === 'crew'
      && stage === 'approach' && snapshot.story.objectives.every(objective => objective.current >= objective.target)) cue = 'landed';
    else if (old.phase !== snapshot.phase) {
      stopPlayback(); clearTimeout(clearCaption.current); setCaption('');
      lastCue.current = { cue: '', at: 0 };
    }
    previous.current = {
      room: snapshot.roomId, phase: snapshot.phase, stage, safety, step, muted, ready: manifestReady, visible, incident, masks, pilot, seatbelt,
      sabotage: snapshot.sabotage ?? '', active: snapshot.story.turbulence.active,
    };
    if (cue) {
      lastCue.current = { cue, at: Date.now() };
      setCaption(LINES[cue]);
      clearTimeout(clearCaption.current);
      clearCaption.current = setTimeout(() => setCaption(''), 6500);
    } else if (!muted && visible && manifestReady && (old.muted || !old.ready || !old.visible || old.phase === 'meeting')) {
      if (snapshot.phase === 'playing' && safety === 'demonstrating' && step === 0) cue = 'demonstration';
      else if (snapshot.phase === 'playing' && incident !== 'none') cue = incident === 'decompression' ? 'pressure' : 'smoke';
      else if (snapshot.phase === 'playing' && pilot === 'poisoned') cue = 'medical';
      else if (snapshot.phase === 'playing' && Date.now() - lastCue.current.at < 8000) cue = lastCue.current.cue;
    }
    if (cue && !muted && visible && manifestReady) playCue(cue, cue === 'demonstration' ? snapshot.safety.elapsed : 0);
  }, [snapshot?.roomId, snapshot?.phase, snapshot?.story.stage, snapshot?.story.turbulence.active,
    snapshot?.sabotage, snapshot?.winner, snapshot?.safety.status, snapshot?.safety.step, snapshot?.experience?.incident, snapshot?.experience?.masksDeployed, snapshot?.experience?.pilotCondition,
    snapshot?.story.seatbeltSign, muted, visible, audible, manifestReady, playCue, stopPlayback]);

  useEffect(() => () => { clearTimeout(clearCaption.current); stopPlayback(); }, [stopPlayback]);
  if (snapshot?.phase === 'playing' && snapshot.experience?.incident !== 'none' && snapshot.experience?.incident) {
    return snapshot.experience.incident === 'decompression' ? LINES.pressure : LINES.smoke;
  }
  if (snapshot?.phase === 'playing' && snapshot.experience?.pilotCondition === 'poisoned') return LINES.medical;
  if (snapshot?.phase === 'playing' && snapshot.safety.status === 'demonstrating') {
    return SAFETY_LINES[snapshot.safety.step] ?? LINES.demonstration;
  }
  return caption;
}
