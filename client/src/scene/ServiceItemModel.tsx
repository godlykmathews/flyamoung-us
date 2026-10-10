import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh } from 'three';
import type { ServiceItem } from '../../../shared/protocol';

/** Blender-authored tray, porcelain, cutlery and folded fabric, in local metres. */
export function ServiceItemModel({ item }: { item: ServiceItem }) {
  const { scene } = useGLTF(`/models/service/${item}.glb`, false, false);
  const model = useMemo(() => {
    const object = scene.clone(true);
    object.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    return object;
  }, [scene]);
  return <primitive object={model} dispose={null} />;
}
