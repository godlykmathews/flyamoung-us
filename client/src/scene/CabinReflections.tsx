import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Local soft reflections let PBR aluminum read as metal without a remote HDR. */
export function CabinReflections({ blackout }: { blackout: boolean }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const previous = scene.environment;
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, .025);
    scene.environment = target.texture;
    room.dispose();
    generator.dispose();
    return () => {
      scene.environment = previous;
      target.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    scene.environmentIntensity = blackout ? .025 : .32;
    return () => { scene.environmentIntensity = previous; };
  }, [scene, blackout]);
  return null;
}
