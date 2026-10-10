import { Client, type Room } from '@colyseus/sdk';
import { waitForFlightServer, connectionErrorMessage, resolveServerEndpoint } from './connection';
import type { Snapshot, Secret, TaskChallenge, SafetyChallenge } from '../../../shared/protocol';
export type ConnectionStatus = 'idle' | 'connecting' | 'waking' | 'boarding';
export interface SessionState { snapshot: Snapshot | null; secret: Secret | null; challenge: TaskChallenge | null; safetyChallenge: SafetyChallenge | null; error: string; connected: boolean; connectionStatus: ConnectionStatus; }
let state: SessionState = { snapshot:null, secret:null, challenge:null, safetyChallenge:null, error:'', connected:false, connectionStatus:'idle' };
let room: Room | null = null;
let pendingConnection: AbortController | null = null;
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
 cancelConnection:()=>pendingConnection?.abort(),
 async connect(name:string,mode:'create'|'join'|'training',code='') {
   pendingConnection?.abort();
   const attempt = new AbortController();
   pendingConnection = attempt;
   publish({error:'',secret:null,challenge:null,safetyChallenge:null,connectionStatus:'connecting'});
   try {
   const endpoint = resolveServerEndpoint(import.meta.env.VITE_SERVER_URL, location.href);
   await waitForFlightServer(endpoint, { signal: attempt.signal, onWaiting:()=>{if(pendingConnection===attempt)publish({connectionStatus:'waking'});} });
   attempt.signal.throwIfAborted();
   publish({connectionStatus:'boarding'});
   const client = new Client(endpoint);
   const joined = mode==='join' ? await client.joinById(code.trim(),{name}) : await client.create('flight',{name,training:mode==='training'});
   joined.reconnection.maxRetries = 0; // This prototype removes disconnected seats immediately.
   if(attempt.signal.aborted){void joined.leave().catch(()=>undefined);attempt.signal.throwIfAborted();}
   room=joined;
   // A hosted socket can finish closing after the player has boarded another room.
   const publishJoined = (next:Partial<SessionState>) => { if(room===joined)publish(next); };
   joined.onMessage('snapshot',(snapshot:Snapshot)=>publishJoined({snapshot,...(state.safetyChallenge && (snapshot.phase!=='playing'||snapshot.safety.status!=='arranging'||snapshot.safety.operatorId!==joined.sessionId)?{safetyChallenge:null}:{})}));
   joined.onMessage('secret',(secret:Secret)=>publishJoined({secret}));
   joined.onMessage('challenge',(challenge:TaskChallenge)=>publishJoined({challenge}));
   joined.onMessage('safetyChallenge',(safetyChallenge:SafetyChallenge)=>publishJoined({safetyChallenge,error:''}));
   joined.onMessage('error',(payload:unknown)=>publishJoined({error:connectionErrorMessage(payload,'Action unavailable.')}));
   joined.onError((_code,message)=>publishJoined({error:connectionErrorMessage(message,'Connection error. Please reconnect to the flight.')}));
   joined.onLeave(()=>{if(room===joined){room=null;publish({connected:false,snapshot:null,secret:null,challenge:null,safetyChallenge:null,error:'You left the flight. Create or join another flight to board again.'});}});
   publish({connected:true});
   joined.send('sync');
   } finally {
     if(pendingConnection===attempt){pendingConnection=null;publish({connectionStatus:'idle'});}
   }
 },
 async leave(){
   pendingConnection?.abort();
   const current=room;room=null;
   publish({snapshot:null,secret:null,challenge:null,safetyChallenge:null,connected:false,error:''});
   // Clear UI before waiting for the remote close acknowledgement; never reset a new room.
   await current?.leave().catch(()=>undefined);
 }
};
