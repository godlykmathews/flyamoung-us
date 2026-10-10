import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, SRGBColorSpace, Vector3 } from 'three';

const CLOUD_TEXTURE = '/textures/cumulus-density.png';

/** Soft density slices distributed through space, with proper depth sorting.
 * The local texture has baked sunlight and soft extinction from a 3D density
 * field. No flattened opaque spheres, external CDN, or per-frame React state.
 */
export function CloudVolumes({ moving }: { moving: boolean }) {
 const ref = useRef<InstancedMesh>(null);
 const travel = useRef(0);
 const transform = useMemo(() => new Object3D(), []);
 const texture = useTexture(CLOUD_TEXTURE);
 texture.colorSpace = SRGBColorSpace;
 const puffs = useMemo(() => {
  let seed = 404;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 30 }, (_, cluster) => {
   // Two depths make clouds visibly pass one another through a small window.
   // Keep every bank below the aircraft so no opaque cloud enters the cabin.
   const far = cluster > 19;
   const cx = (random() - .5) * (far ? 1300 : 550);
   const cy = far ? -48 - random() * 24 : -26 - random() * 17;
   const cz = (random() - .5) * 1400;
   return Array.from({ length: 10 }, () => ({
    position: new Vector3(cx + (random() - .5) * 34, cy + (random() - .5) * 8, cz + (random() - .5) * 25),
    world: new Vector3(),
    size: (far ? 36 : 20) + random() * 19,
    aspect: .9 + random() * .22,
    color: new Color().setScalar(.93 + random() * .07),
    distance: 0,
   }));
  }).flat();
 }, []);
 useFrame(({ camera }, delta) => {
  const mesh = ref.current;
  if (!mesh) return;
  if (moving) travel.current += Math.min(delta, .1) * 13;
  for (const puff of puffs) {
   puff.world.set(puff.position.x, puff.position.y, ((puff.position.z + travel.current + 700) % 1400) - 700);
   puff.distance = puff.world.distanceToSquared(camera.position);
  }
  // Transparent instances need explicit sorting as the camera moves.
  puffs.sort((a, b) => b.distance - a.distance);
  puffs.forEach((puff, i) => {
   transform.position.copy(puff.world);
   transform.quaternion.copy(camera.quaternion);
   transform.scale.set(puff.size, puff.size * puff.aspect, 1);
   transform.updateMatrix();
   mesh.setMatrixAt(i, transform.matrix);
   mesh.setColorAt(i, puff.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
 });
 return <instancedMesh ref={ref} args={[undefined, undefined, puffs.length]} frustumCulled={false} onUpdate={mesh => mesh.instanceMatrix.setUsage(DynamicDrawUsage)}>
  <planeGeometry args={[1, 1]}/>
  <meshBasicMaterial map={texture} transparent opacity={.83} depthWrite={false} fog={false} />
 </instancedMesh>;
}
