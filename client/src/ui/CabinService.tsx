import { Coffee, Check, Package, Skull, Utensils, Users, Droplets, Layers } from 'lucide-react';
import type { CabinNpc, Player, Secret, ServiceItem, Snapshot } from '../../../shared/protocol';
import { hasCabinSight, IMPOSTOR_STATION, SERVICE_GALLEY } from '../../../shared/world';
import { session } from '../network/session';
import { canPerformDuty } from '../../../shared/duties';
import './cabin-service.css';

export const SERVICE_ITEMS: Record<ServiceItem, { label: string; Icon: typeof Coffee }> = {
  water: { label: 'Water', Icon: Droplets },
  coffee: { label: 'Coffee', Icon: Coffee },
  meal: { label: 'Meal tray', Icon: Utensils },
  blanket: { label: 'Blanket', Icon: Layers },
};
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function nearbyPassenger(snapshot: Snapshot, me?: Player) {
  if (!me?.carriedItem || me.detained || me.weaponDrawn || snapshot.experience.players[me.id]?.incapacitated || !canPerformDuty(me.role, 'service', snapshot.training)) return undefined;
  return snapshot.npcs.filter(npc => npc.alive && npc.kind === 'passenger' && npc.request?.item === me.carriedItem && distance(me, npc) < 2.4 && hasCabinSight(me, npc))
    .sort((a, b) => distance(me, a) - distance(me, b))[0];
}

export function deliverToPassenger(npc: CabinNpc) {
  if (npc.request) session.send('servePassenger', { npcId: npc.id, requestId: npc.request.id });
}

export function nearestVictim(snapshot: Snapshot, me?: Player) {
  if (!me) return undefined;
  return snapshot.npcs.filter(npc => npc.alive && distance(me, npc) < 1.8 && hasCabinSight(me, npc))
    .sort((a, b) => distance(me, a) - distance(me, b))[0];
}

export function CabinActions({ snapshot, secret, me, onService }: {
  snapshot: Snapshot; secret: Secret | null; me?: Player; onService: () => void;
}) {
  if (!me || me.detained) return null;
  const canServe = canPerformDuty(me.role, 'service', snapshot.training);
  const requests = snapshot.npcs.filter(npc => npc.alive && npc.request);
  const victim = secret?.allegiance === 'saboteur' ? nearestVictim(snapshot, me) : undefined;
  const item = me.carriedItem ? SERVICE_ITEMS[me.carriedItem] : undefined;
  return <aside className="cabin-service-hud">
    {(canServe || item) && <button className="service-summary" onClick={onService}>
      {item ? <item.Icon size={18} /> : <Users size={18} />}
      <span><strong>{item ? `Carrying ${item.label.toLowerCase()}` : 'Cabin service'}</strong>
        <small>{requests.length ? `${requests.length} passenger ${requests.length === 1 ? 'request' : 'requests'}` : 'Passengers are comfortable'}</small></span>
    </button>}
    {secret?.allegiance==='saboteur' && me.weaponDrawn && <div className="weapon-status">Weapon drawn · visible to other crew</div>}
    {victim && me.weaponDrawn && !snapshot.operations && <button className="npc-eliminate" disabled={!!secret?.killCooldown} onClick={() => session.send('killNpc', { npcId: victim.id })}>
      <Skull size={16} /><span>{secret?.killCooldown ? `Ready in ${Math.ceil(secret.killCooldown)}s` : `Eliminate ${victim.kind === 'passenger' ? `seat ${victim.seat}` : victim.kind}`}</span><kbd>F</kbd>
    </button>}
  </aside>;
}

export function CabinServicePanel({ snapshot, me, secret }: { snapshot: Snapshot; me?: Player; secret: Secret | null }) {
  const canServe = !!me && canPerformDuty(me.role, 'service', snapshot.training);
  const canCollect = canServe || secret?.allegiance === 'saboteur';
  const atGalley = !!me && distance(me, SERVICE_GALLEY) < 2.25;
  const active = snapshot.phase === 'playing' && !!me && !me.detained && !me.weaponDrawn && !snapshot.experience.players[me.id]?.incapacitated;
  const passengers = snapshot.npcs.filter(npc => npc.kind === 'passenger');
  const attendant = snapshot.npcs.find(npc => npc.kind === 'attendant');
  return <>
    <h2>Cabin service</h2>
    <p>{canServe ? "Collect an item at the aft galley, then bring it to the passenger’s seat." : canCollect ? "Collect supplies at the galley for your private objectives. Cabin Crew handles passenger service." : "Cabin Crew handles supplies and deliveries. This is your team’s service status."}</p>
    <div className="service-score"><span><b>{snapshot.service.served}</b> Served</span><span><b>{Math.round(snapshot.service.satisfaction)}%</b> Comfort</span></div>
    {canCollect && <div className="galley-supplies">
      <span className="eyebrow">{atGalley ? 'GALLEY SUPPLIES' : 'COLLECT AT THE AFT GALLEY'}</span>
      <div>{(Object.entries(SERVICE_ITEMS) as [ServiceItem, typeof SERVICE_ITEMS.water][]).map(([key, { label, Icon }]) =>
        <button key={key} disabled={!atGalley || !active} className={me?.carriedItem === key ? 'selected' : ''}
          onClick={() => session.send('pickUpService', { item: key })} aria-label={`Collect ${label.toLowerCase()}`}>
          <Icon size={17} />{label}{me?.carriedItem === key && <Check size={14} />}
        </button>)}</div>
      <small>{me?.carriedItem ? `Carrying ${SERVICE_ITEMS[me.carriedItem].label.toLowerCase()}. Collect another item to exchange it.` : 'Carry one item at a time.'}</small>
    </div>}
    <div className={`attendant-status ${attendant?.alive ? '' : 'unavailable'}`}><span className="role-dot" />
      {attendant?.alive ? `AI attendant · ${attendant.pose === 'serving' ? 'Serving a passenger' : attendant.pose === 'walking' ? 'On cabin rounds' : 'Ready for service'}` : 'AI attendant unavailable · Cabin Crew must take over'}
    </div>
    <div className="passenger-requests">{passengers.map(npc => {
      const request = npc.request;
      const inRange = !!me && distance(me, npc) < 2.4 && hasCabinSight(me, npc);
      const ready = canServe && active && npc.alive && !!request && me?.carriedItem === request.item && inRange;
      const Icon = request ? SERVICE_ITEMS[request.item].Icon : npc.alive ? Users : Skull;
      return <div className={`passenger-request ${request ? 'waiting' : ''} ${npc.alive ? '' : 'unavailable'}`} key={npc.id}>
        <span className="seat-number">{npc.seat}</span><div><strong>{npc.alive ? npc.needsSeat ? 'Needs seating' : request ? SERVICE_ITEMS[request.item].label : 'Comfortable' : 'Passenger eliminated'}</strong>
          <small>{request ? `${Math.ceil(request.remaining)}s remaining${request.claimedBy ? ' · Attendant en route' : ''}` : npc.alive ? npc.needsSeat ? canServe ? 'Approach and hold E to guide' : 'Cabin Crew will guide them to a seat' : 'Seated' : 'Report suspicious activity'}</small></div>
        {canServe && request && npc.alive ? <button disabled={!ready} onClick={() => deliverToPassenger(npc)} aria-label={`Serve seat ${npc.seat}`} title={!inRange ? 'Move closer to this seat' : 'Carry the requested item'}><Icon size={17} /><span>Serve</span></button> : <Icon size={17} />}
      </div>;
    })}</div>
  </>;
}

export function ImpostorObjectives({ secret, me }: { secret: Secret; me?: Player }) {
  const near = !!me && distance(me, IMPOSTOR_STATION) < 2.25;
  const done = secret.objectives.find(objective => objective.id === 'tamper-galley')?.completed;
  return <div className="impostor-objectives"><span className="eyebrow">PRIVATE TERRORIST OBJECTIVES</span>
    {secret.objectives.map(objective => <div key={objective.id}><span className={objective.completed ? 'is-complete' : ''}>{objective.completed ? <Check size={14} /> : <span className="objective-dot" />}</span>{objective.label}</div>)}
    <button className="secondary" disabled={!near || done || me?.detained} onClick={() => session.send('impostorTask', { taskId: 'tamper-galley' })}><Package size={16} />{done ? 'Manifest falsified' : 'Falsify service manifest'}</button>
    {!near && !done && <small>Use the aft galley to alter the manifest.</small>}
  </div>;
}
