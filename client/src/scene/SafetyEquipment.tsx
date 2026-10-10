import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from 'three';

const EQUIPMENT_PATHS = ['belt-left', 'belt-right', 'oxygen-mask', 'life-vest-folded', 'life-vest']
  .map(name => `/models/safety/${name}.glb`);

export interface SafetyEquipmentHandle {
  update(step: number, clipTime: number, character: Group, left?: Object3D, right?: Object3D): void;
}

/** Original Blender equipment follows the evaluated skeleton, in the character's frame. */
export const SafetyEquipment = forwardRef<SafetyEquipmentHandle>(function SafetyEquipment(_, ref) {
  const models = useGLTF(EQUIPMENT_PATHS, false, false);
  const equipment = useMemo(() => {
    const root = new Group();
    const objects = models.map(model => {
      const object = model.scene.clone(true);
      object.traverse(node => {
        if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; }
      });
      object.visible = false;
      root.add(object);
      return object;
    });
    return { root, objects };
  }, [models]);
  const scratch = useMemo(() => ({
    left: new Vector3(), right: new Vector3(), offset: new Vector3(), rotation: new Quaternion(),
    face: new Vector3(0, 1.605, -.127), sternum: new Vector3(0, 1.38, -.103),
  }), []);

  useImperativeHandle(ref, () => {
    const palm = (hand: Object3D, target: Vector3, character: Group) => {
      hand.getWorldPosition(target);
      hand.getWorldQuaternion(scratch.rotation);
      scratch.offset.set(0, .04, 0).applyQuaternion(scratch.rotation);
      target.add(scratch.offset);
      character.worldToLocal(target);
    };
    return {
      update(step, clipTime, character, left, right) {
        for (const object of equipment.objects) object.visible = false;
        if (!left || !right) return;
        palm(left, scratch.left, character);
        palm(right, scratch.right, character);
        const [beltLeft, beltRight, mask, foldedVest, vest] = equipment.objects;
        if (step === 0) {
          beltLeft.visible = beltRight.visible = true;
          beltLeft.position.copy(scratch.left); beltLeft.position.z -= .035;
          beltRight.position.copy(scratch.right); beltRight.position.z -= .035;
        } else if (step === 1) {
          mask.visible = clipTime > .55;
          mask.scale.setScalar(MathUtils.smoothstep(clipTime, .55, .8));
          mask.position.copy(scratch.right); mask.position.z -= .025;
          mask.position.lerp(scratch.face, MathUtils.smoothstep(clipTime, 1.6, 1.95));
        } else if (step === 2) {
          const deployment = MathUtils.smoothstep(clipTime, 1.1, 1.6);
          foldedVest.visible = clipTime > .2 && deployment < .999;
          foldedVest.position.copy(scratch.left).add(scratch.right).multiplyScalar(.5);
          foldedVest.position.z -= .025;
          foldedVest.scale.setScalar((1 - deployment) * MathUtils.smoothstep(clipTime, .2, .4));
          vest.visible = deployment > .001;
          vest.position.copy(scratch.sternum);
          vest.scale.setScalar(.8 + .2 * deployment);
        }
      },
    };
  }, [equipment, scratch]);

  return <primitive object={equipment.root} dispose={null}/>;
});
