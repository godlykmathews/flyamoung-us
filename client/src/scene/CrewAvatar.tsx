import { Component, Suspense, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils } from 'three';
import { session } from '../network/session';
import type { Player, SafetyDemoState } from '../../../shared/protocol';
import { CharacterModel } from './CharacterModel';
import { CrewNameplate } from './CrewNameplate';

function LoadingCrew({ color }: { color: string }) {
  return <group>
    <mesh position={[0, 1.05, 0]}><capsuleGeometry args={[0.23, 0.55, 4, 10]} /><meshStandardMaterial color={color} /></mesh>
    <mesh position={[0, 1.63, 0]}><sphereGeometry args={[0.18, 16, 12]} /><meshStandardMaterial color="#bc8a69" /></mesh>
    {[-0.13, 0.13].map(x => <mesh key={x} position={[x, 0.34, 0]}><capsuleGeometry args={[0.085, 0.48, 4, 8]} /><meshStandardMaterial color="#263749" /></mesh>)}
  </group>;
}

class CharacterBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function CrewAvatar({ player, safety }: { player: Player; safety?: SafetyDemoState }) {
  const root = useRef<Group>(null);
  const movement = useRef(0);
  const initialized = useRef(false);
  useFrame((_, delta) => {
    const group = root.current;
    const current = session.get().snapshot?.players.find(p => p.id === player.id);
    if (!group || !current) return;
    if (!initialized.current) {
      group.position.set(current.x, 0, current.z);
      group.rotation.y = current.yaw;
      initialized.current = true;
    }
    const beforeX = group.position.x;
    const beforeZ = group.position.z;
    group.position.x = MathUtils.damp(beforeX, current.x, 14, delta);
    group.position.z = MathUtils.damp(beforeZ, current.z, 14, delta);
    movement.current = current.detained ? 0 : Math.min(1, Math.hypot(group.position.x - beforeX, group.position.z - beforeZ) / Math.max(delta, 0.001) / 2.2);
    const angle = Math.atan2(Math.sin(current.yaw - group.rotation.y), Math.cos(current.yaw - group.rotation.y));
    group.rotation.y += angle * (1 - Math.exp(-14 * delta));
  });
  const personal=session.get().snapshot?.experience.players[player.id];
  const restrained=!!session.get().snapshot?.operations?.restraints[player.id];
  const working=session.get().snapshot?.experience.actions.some(a=>a.playerId===player.id);
  const fallback = <LoadingCrew color={player.color} />;
  return <group ref={root}>
    <CharacterBoundary fallback={fallback}><Suspense fallback={fallback}><CharacterModel movement={movement} model={player.model} carrying={!!player.carriedItem} item={player.carriedItem} weapon={player.weaponDrawn} tool={player.equippedTool??null} safety={safety} oxygenMask={personal?.oxygenMask} pose={personal?.incapacitated?'dead':personal?.activity==='reading'?'reading':personal?.activity==='resting'?'resting':working?'gesture':session.get().snapshot?.interactions.some(a=>a.playerId===player.id)?'gesture':'idle'} /></Suspense></CharacterBoundary>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
      <ringGeometry args={[0.28, 0.31, 32]} /><meshBasicMaterial color={player.detained ? '#8895a0' : restrained ? '#bc8745' : player.color} transparent opacity={0.75} depthWrite={false} />
    </mesh>
    {safety?.status!=='demonstrating'&&<CrewNameplate name={player.name} role={player.role} color={player.color} detained={player.detained} restrained={restrained} />}
  </group>;
}
