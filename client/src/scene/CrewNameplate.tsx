import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, Sprite, SRGBColorSpace, Vector3 } from 'three';
import type { Player } from '../../../shared/protocol';

type CrewNameplateProps = Pick<Player, 'name' | 'role' | 'color' | 'detained'>;

export function CrewNameplate({ name, role, color, detained }: CrewNameplateProps) {
  const sprite = useRef<Sprite>(null);
  const world = useMemo(() => new Vector3(), []);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.beginPath();
    context.roundRect(2, 2, 508, 156, 18);
    context.fillStyle = '#f7fbff';
    context.fill();
    context.strokeStyle = '#bfd1de';
    context.lineWidth = 3;
    context.stroke();
    context.save();
    context.clip();
    context.fillStyle = detained ? '#8895a0' : color;
    context.fillRect(0, 0, 512, 10);
    context.restore();

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#23425d';
    context.font = '600 40px Arial, sans-serif';
    const nameSize = Math.min(40, 40 * 460 / Math.max(context.measureText(name).width, 1));
    context.font = `600 ${nameSize}px Arial, sans-serif`;
    context.fillText(name, 256, 65);
    context.fillStyle = '#607184';
    context.font = '27px Arial, sans-serif';
    context.fillText(detained ? 'DETAINED' : role, 256, 117, 460);

    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.minFilter = LinearFilter;
    map.generateMipmaps = false;
    return map;
  }, [name, role, color, detained]);

  useEffect(() => () => { texture?.dispose(); }, [texture]);
  useFrame(({ camera }) => {
    if (!sprite.current) return;
    sprite.current.getWorldPosition(world);
    // Perspective depth keeps the label readable without enlarging it up close.
    const viewDepth = -world.applyMatrix4(camera.matrixWorldInverse).z;
    const closeScale = Math.min(1, Math.max(0, viewDepth) / 3);
    sprite.current.scale.set(.78 * closeScale, .24375 * closeScale, 1);
  });
  if (!texture) return null;

  return <sprite ref={sprite} position={[0, 2.03, 0]} scale={[0.78, 0.24375, 1]}>
    <spriteMaterial map={texture} transparent depthTest depthWrite={false} toneMapped={false} />
  </sprite>;
}
