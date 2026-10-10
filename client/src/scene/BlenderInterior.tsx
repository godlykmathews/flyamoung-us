import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { MathUtils, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { EQUIPMENT_IDS, type EquipmentId } from '../../../shared/tasks';

const ASSET_ROOT = '/models/interior/';
type Vec3 = [number, number, number];

// Models use meters and the existing collision world's origin: Y up, nose -Z.
// These mounts deliberately remain independent of the server's task locations.
const TASK_MOUNTS: Record<EquipmentId, { position: Vec3; rotation: Vec3 }> = {
  checklist: { position: [-1.25, 1.63, -11.93], rotation: [0, 0, 0] },
  navigation: { position: [1.25, 1.65, -11.93], rotation: [0, 0, 0] },
  seatbelts: { position: [1.9, 1.16, -3.38], rotation: [0, 0, 0] },
  meals: { position: [-2.74, 1.175, 9.4], rotation: [0, Math.PI / 2, 0] },
  electrical: { position: [2.457, 1.41, 12.3], rotation: [0, -Math.PI / 2, 0] },
};

/** Clone stateful materials, while geometry and textures stay in the GLTF cache. */
function useInteriorAsset(filename: string) {
  const { scene } = useGLTF(`${ASSET_ROOT}${filename}.glb`, false, false);
  const asset = useMemo(() => {
    const object = scene.clone(true);
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const switches: { object: Object3D; rest: number }[] = [];
    const buckles: { object: Object3D; rest: number }[] = [];
    object.traverse(node => {
      // GLTFLoader replaces spaces in mesh names with underscores, so only
      // animate authored pivot groups, never similarly named lever children.
      if (!(node instanceof Mesh) && /^Switch_(cabin|galley|seats|comms)/i.test(node.name)) switches.push({ object: node, rest: node.rotation.x });
      if (!(node instanceof Mesh) && node.name.startsWith('Buckle_Tongue')) buckles.push({ object: node, rest: node.position.x });
      if (!(node instanceof Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const cloneStateful = (material: MeshStandardMaterial) => {
        if (!['cabin_emissive', 'status_lamp', 'cabin_window_daylight'].includes(material.name)) return material;
        if (!materials.has(material)) {
          const copy=material.clone();
          if(copy.name==='cabin_window_daylight'){
            copy.transparent=true;copy.opacity=.065;copy.depthWrite=false;
            copy.color.set('#bddce9');copy.emissive.set('#000000');copy.emissiveIntensity=0;
            copy.roughness=.12;copy.metalness=0;
          }
          materials.set(material,copy);
        }
        return materials.get(material)!;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(cloneStateful)
        : cloneStateful(node.material);
      const glazing = Array.isArray(node.material) ? node.material.every(m=>m.name==='cabin_window_daylight') : node.material.name==='cabin_window_daylight';
      if(glazing)node.castShadow=false;
    });
    return { object, materials, switches, buckles };
  }, [scene]);
  useEffect(() => () => { asset.materials.forEach(material => material.dispose()); }, [asset]);
  return asset;
}

function CabinStructure({ blackout }: { blackout: boolean }) {
  const asset = useInteriorAsset('aircraft-cabin');
  useEffect(() => {
    asset.materials.forEach((material, original) => {
      if (material.name === 'cabin_emissive') {
        material.emissiveIntensity = blackout ? 0 : original.emissiveIntensity;
        material.color.copy(original.color).multiplyScalar(blackout ? .15 : 1);
      }
    });
  }, [asset, blackout]);
  return <primitive object={asset.object} dispose={null} />;
}

function FixedEquipment() {
  const asset = useInteriorAsset('flight-equipment');
  return <primitive object={asset.object} dispose={null} />;
}

function TaskModel({ taskId, done }: { taskId: EquipmentId; done: boolean }) {
  const asset = useInteriorAsset(taskId);
  useEffect(() => {
    asset.materials.forEach(material => {
      if (material.name === 'status_lamp') {
        material.color.set(done ? '#3cbd9c' : '#efbb68');
        material.emissive.copy(material.color);
      }
    });
  }, [asset, done]);
  useFrame((_, delta) => {
    // Small physical completion feedback; the Colyseus snapshot owns task state.
    const blend = 1 - Math.exp(-12 * delta);
    asset.switches.forEach(({ object, rest }) => {
      object.rotation.x = MathUtils.lerp(object.rotation.x, rest + (done ? -.38 : 0), blend);
    });
    asset.buckles.forEach(({ object, rest }) => {
      object.position.x = MathUtils.lerp(object.position.x, rest - (done ? .045 : 0), blend);
    });
  });
  return <group {...TASK_MOUNTS[taskId]}><primitive object={asset.object} dispose={null} /></group>;
}

/** Blender-authored visual layer. Collision, tasks and flight state remain modular. */
export function BlenderInterior({ blackout, completedTasks }: { blackout: boolean; completedTasks: string[] }) {
  return <group>
    <CabinStructure blackout={blackout} />
    <FixedEquipment />
    {EQUIPMENT_IDS.map(id => <TaskModel key={id} taskId={id} done={completedTasks.includes(id)} />)}
  </group>;
}
