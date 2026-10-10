import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Group, MathUtils, SRGBColorSpace, Sprite, Vector3 } from 'three';
import type { CabinNpc, ServiceItem, ExperienceState } from '../../../shared/protocol';
import { AuthoredCharacterModel } from './CharacterModel';
import { ServiceItemModel } from './ServiceItemModel';

const REQUEST_TEXT: Record<ServiceItem, string> = {
  water: 'Water, please', coffee: 'Coffee, please', meal: 'A meal, please', blanket: 'A blanket, please',
};

/** Small service pictograms drawn into the same atlas as the name, without DOM. */
function drawServiceIcon(ctx: CanvasRenderingContext2D, item: ServiceItem, x: number, y: number) {
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (item === 'water') {
    ctx.beginPath(); ctx.moveTo(-12, -15); ctx.lineTo(-9, 17); ctx.lineTo(9, 17); ctx.lineTo(12, -15); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
  } else if (item === 'coffee') {
    ctx.strokeRect(-14, -8, 24, 23); ctx.beginPath(); ctx.arc(13, 1, 7, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -17); ctx.lineTo(-10, -23); ctx.moveTo(0, -17); ctx.lineTo(0, -23); ctx.stroke();
  } else if (item === 'meal') {
    ctx.beginPath(); ctx.ellipse(0, 8, 22, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 5, 17, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -18); ctx.stroke();
  } else {
    ctx.strokeRect(-18, -16, 36, 33); ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(-10, 17); ctx.moveTo(-18, 8); ctx.lineTo(18, 8); ctx.stroke();
  }
  ctx.restore();
}

function NpcNameplate({ npc, notice }: { npc: CabinNpc; notice?:string }) {
  const sprite = useRef<Sprite>(null);
  const world = useMemo(() => new Vector3(), []);
  const item = npc.alive ? npc.request?.item : undefined;
  const claimed = !!npc.request?.claimedBy;
  const compact = !notice && npc.alive && npc.kind === 'passenger' && !item && !npc.needsSeat;
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = compact ? 384 : 640; canvas.height = compact ? 88 : 208;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = npc.alive ? 'rgba(243,247,249,.96)' : 'rgba(219,225,230,.96)';
    ctx.beginPath(); ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, compact ? 14 : 22); ctx.fill();
    ctx.strokeStyle = item ? '#b2853f' : '#bacbd5'; ctx.lineWidth = 3; ctx.stroke();
    if (compact) {
      ctx.fillStyle = '#496376'; ctx.font = '500 34px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(`SEAT ${npc.seat ?? ''}`, canvas.width / 2, canvas.height / 2);
      const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
    }
    ctx.fillStyle = '#243a4c'; ctx.font = '600 37px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(npc.name, 28,  61, 582);
    ctx.fillStyle = !npc.alive ? '#687986' : item ? '#81561f' : '#597180';
    ctx.font = '500 28px system-ui, sans-serif';
    const subtitle = notice ?? (!npc.alive ? 'Unresponsive' : npc.needsSeat ? 'Please guide me to my seat' : item ? claimed ? 'Service on the way' : REQUEST_TEXT[item] : npc.kind === 'pilot' ? 'Flight crew' : npc.kind === 'attendant' ? 'Cabin service' : npc.seat ? `Seat ${npc.seat}` : 'Passenger');
    if (item) { ctx.strokeStyle = '#81561f'; drawServiceIcon(ctx, item, 49, 138); }
    ctx.fillText(subtitle, item ? 89 : 28, 140, item ? 516 : 584);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }, [npc.name, npc.kind, npc.alive, npc.seat, item, claimed, compact, npc.needsSeat, notice]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera }, delta) => {
    if (!sprite.current) return;
    sprite.current.getWorldPosition(world);
    const material = sprite.current.material;
    const distance = compact ? 2.8 : item ? 9 : 6;
    material.opacity = MathUtils.damp(material.opacity, world.distanceTo(camera.position) < distance ? 1 : 0, 8, delta);
    // Cap the apparent size inside three metres, including glancing views near the camera.
    const viewDepth = -world.applyMatrix4(camera.matrixWorldInverse).z;
    const closeScale = Math.min(1, Math.max(0, viewDepth) / 3);
    sprite.current.scale.set((compact ? .48 : 1.02) * closeScale, (compact ? .11 : .33) * closeScale, 1);
  });
  const standing = npc.kind === 'attendant' || npc.needsSeat || npc.pose === 'standing' || npc.pose === 'walking';
  const height = !npc.alive && standing ? .52 : standing ? 1.98 : 1.65;
  return <sprite ref={sprite} position={[0, compact ? 1.62 : height, 0]} scale={compact ? [.48, .11, 1] : [1.02, .33, 1]}>
    <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
  </sprite>;
}

/** Held service items stay attached to the same server-driven character root. */
export function CarriedServiceItem({ item, oneHanded = false }: { item: ServiceItem | null; oneHanded?: boolean }) {
  if (!item) return null;
  return <group position={[oneHanded ? .18 : 0, oneHanded ? 1.015 : 1.01, -.37]}>
    <Suspense fallback={null}><ServiceItemModel item={item} /></Suspense>
  </group>;
}

class NpcModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Cabin character could not load:', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function NpcBody({ npc, movement, turbulence, medical, agitated }: { npc: CabinNpc; movement: MutableRefObject<number>; turbulence: boolean; medical:boolean; agitated:boolean }) {
  const wasSeated=useRef(npc.kind !== 'attendant' && !npc.needsSeat);
  if(npc.alive)wasSeated.current=npc.pose==='seated'||npc.pose==='sitting';
  return <NpcModelBoundary key={npc.model}><Suspense fallback={null}>
    <AuthoredCharacterModel model={npc.model} movement={movement} carrying={!!npc.carriedItem} item={npc.carriedItem} pose={agitated&&npc.pose==='standing'?'gesture':npc.pose} brace={medical||(turbulence&&npc.kind==='passenger')} seatedDeath={wasSeated.current}/>
  </Suspense></NpcModelBoundary>;
}

function CabinNpcAvatar({ npc, turbulence, experience }: { npc: CabinNpc; turbulence: boolean; experience?:ExperienceState }) {
  const root = useRef<Group>(null);
  const movement = useRef(0);
  const initial = useRef({ x: npc.x, z: npc.z, yaw: npc.yaw });
  useFrame((_, delta) => {
    if (!root.current) return;
    const blend = 1 - Math.exp(-12 * Math.min(delta, .1));
    root.current.position.x = MathUtils.lerp(root.current.position.x, npc.x, blend);
    root.current.position.z = MathUtils.lerp(root.current.position.z, npc.z, blend);
    const turn = Math.atan2(Math.sin(npc.yaw - root.current.rotation.y), Math.cos(npc.yaw - root.current.rotation.y));
    root.current.rotation.y += turn * blend;
    movement.current = npc.alive && npc.pose === 'walking' ? 1 : 0;
  });
  return <group ref={root} position={[initial.current.x, 0, initial.current.z]} rotation={[0, initial.current.yaw, 0]}>
    <NpcBody npc={npc} movement={movement} turbulence={turbulence} medical={npc.kind==='pilot'&&!!experience&&experience.pilotCondition!=='healthy'} agitated={!!experience?.agitated.includes(npc.id)}/>
    <NpcNameplate npc={npc} notice={npc.kind==='pilot'&&experience&&experience.pilotCondition!=='healthy'?(experience.pilotCondition==='poisoned'?'Unwell · crew assistance needed':'Recovering · autopilot engaged'):experience?.agitated.includes(npc.id)?'Upset · please reassure me':undefined}/>
  </group>;
}

export function CabinNpcs({ npcs, turbulence = false, experience }: { npcs: CabinNpc[]; turbulence?: boolean; experience?:ExperienceState }) {
  return <group>{npcs.map(npc => <CabinNpcAvatar key={npc.id} npc={npc} turbulence={turbulence} experience={experience} />)}</group>;
}
