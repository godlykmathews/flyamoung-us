import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, MathUtils, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import type { SafetyDemoState } from '../../../shared/protocol';
import { SAFETY_DEMO_STATION } from '../../../shared/world';

/** A companion-camera view of the local player; other crew keep walking and
 * see the same authoritative character animation in the shared cabin. */
export function SafetyPresentationCamera({ safety }: { safety: SafetyDemoState }) {
  const { camera, size } = useThree();
  const vectors = useMemo(() => ({ eye: new Vector3(), target: new Vector3(0, 1.11, SAFETY_DEMO_STATION.z), look: new Vector3() }), []);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    const oldFov = (camera as PerspectiveCamera).fov;
    return () => { (camera as PerspectiveCamera).fov = oldFov; camera.updateProjectionMatrix(); };
  }, [camera]);
  useFrame((_, delta) => {
    const blend = reduced ? 1 : 1 - Math.exp(-5 * Math.min(delta, .1));
    const close = safety.step === 0 ? .12 : 0;
    vectors.eye.set(.64, 1.53, SAFETY_DEMO_STATION.z + 3.7 - close);
    camera.position.lerp(vectors.eye, blend);
    camera.getWorldDirection(vectors.look).multiplyScalar(4).add(camera.position).lerp(vectors.target, blend);
    camera.lookAt(vectors.look);
    const perspective = camera as PerspectiveCamera;
    perspective.fov = MathUtils.damp(perspective.fov, size.width / size.height < 1 ? 59 : 47, 6, delta);
    camera.updateProjectionMatrix();
  });
  return <pointLight position={[0, 2.55, -7.7]} color="#fff0d8" intensity={2} distance={4} decay={2}/>;
}

export function SafetyStationSign({ complete }: { complete: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e9eee6'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#a0b4a6'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, 488, 232);
    ctx.fillStyle = '#51746d'; ctx.font = '19px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('F L I G H T   4 0 4', 256, 63);
    ctx.fillStyle = '#2c4d58'; ctx.font = '40px Georgia'; ctx.fillText('Cabin safety', 256, 127);
    ctx.font = '19px sans-serif'; ctx.fillStyle = '#7c8a75'; ctx.fillText(complete ? 'BRIEFING COMPLETE' : 'CREW DEMONSTRATION POINT', 256, 181);
    ctx.fillStyle = '#ae9a67'; ctx.fillRect(215, 211, 82, 3);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }, [complete]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[-1.24, 1.63, -9.875]}><planeGeometry args={[.76, .38]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
