import { Client, type Room } from '@colyseus/sdk';
import type { Snapshot, Secret, TaskChallenge, SafetyChallenge } from '../../../shared/protocol';
export interface SessionState { snapshot: Snapshot | null; secret: Secret | null; challenge: TaskChallenge | null; safetyChallenge: SafetyChallenge | null; error: string; connected: boolean; }
let state: SessionState = { snapshot:null, secret:null, challenge:null, safetyChallenge:null, error:'', connected:false };
let room: Room | null = null;
const listeners = new Set<()=>void>();
const publish = (next:Partial<SessionState>) => {state = {...state,...next}; listeners.forEach(l=>l());};
export const session = {
 subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
 get:()=>state,
 id:()=>room?.sessionId ?? '',
 send:(type:string,payload:unknown={})=>room?.send(type,payload),
 clearChallenge:()=>publish({challenge:null}),
 clearSafetyChallenge:()=>publish({safetyChallenge:null}),
 clearError:()=>publish({error:''}),
 async connect(name:string,mode:'create'|'join'|'training',code='') {
   publish({error:'',secret:null,challenge:null,safetyChallenge:null});
   const endpoint = import.meta.env.VITE_SERVER_URL || `${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:${location.port === '5173' || location.port === '4173' ? '2567' : location.port || (location.protocol==='https:'?'443':'80')}`;
   const client = new Client(endpoint);
   const joined = mode==='join' ? await client.joinById(code.trim(),{name}) : await client.create('flight',{name,training:mode==='training'});
   joined.reconnection.maxRetries = 0; // This prototype removes disconnected seats immediately.
   room=joined;
   joined.onMessage('snapshot',(snapshot:Snapshot)=>publish({snapshot,...(state.safetyChallenge && (snapshot.phase!=='playing'||snapshot.safety.status!=='arranging'||snapshot.safety.operatorId!==joined.sessionId)?{safetyChallenge:null}:{})}));
   joined.onMessage('secret',(secret:Secret)=>publish({secret}));
   joined.onMessage('challenge',(challenge:TaskChallenge)=>publish({challenge}));
   joined.onMessage('safetyChallenge',(safetyChallenge:SafetyChallenge)=>publish({safetyChallenge,error:''}));
   joined.onMessage('error',(payload:{message?:string}|string)=>publish({error:typeof payload==='string'?payload:payload.message||'Action unavailable.'}));
   joined.onError((_code,message)=>publish({error:message||'Connection error.'}));
   joined.onLeave(()=>{if(room===joined){room=null;publish({connected:false,snapshot:null,secret:null,challenge:null,safetyChallenge:null,error:'You left the flight. Create or join another flight to board again.'});}});
   publish({connected:true});
   joined.send('sync');
 },
 async leave(){const current=room;room=null;await current?.leave();publish({snapshot:null,secret:null,challenge:null,safetyChallenge:null,connected:false,error:''});}
};
