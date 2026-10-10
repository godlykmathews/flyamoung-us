import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, Vector3 } from 'three';
import { ExteriorAircraft } from './Aircraft';

export const FLIGHT_MODEL_URL = '/models/boeing-737.glb';
export const FLIGHT_MODEL_LENGTH = 24;

// Verified against the supplied Boeing's node transforms, material assignments,
// and bounds: nose/main tires, hubs, struts and the open bay doors. Object_62 is
// a main-gear axle despite its source material being named "Plane_Egnine".
// This is a cruise pose, not a skeletal retraction animation. Only cloned nodes
// are hidden, so the original asset and useGLTF cache remain unchanged.
const EXTENDED_GEAR_MESHES = new Set([
  'Object_30', 'Object_38', 'Object_54', 'Object_56', 'Object_58',
  'Object_60', 'Object_62', 'Object_64', 'Object_66',
]);

type FlightModelProps = { onReady?: () => void };

/** Optional warm-up; the GLB embeds all textures and needs no external decoders. */
export function preloadFlightModel() {
  useGLTF.preload(FLIGHT_MODEL_URL, false, false);
}

function ImportedAircraft({ onReady }: FlightModelProps) {
  const { scene } = useGLTF(FLIGHT_MODEL_URL, false, false);
  const aircraft = useMemo(() => {
    // Clone transforms so the lobby and launch can independently animate one cached asset.
    const model = scene.clone(true);
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true);
    const size = bounds.getSize(new Vector3());
    if (!Number.isFinite(size.z) || size.z <= 0) throw new Error('Aircraft model has invalid bounds');
    model.position.sub(bounds.getCenter(new Vector3()));
    model.traverse((object) => {
      if (object instanceof Mesh) {
        if (EXTENDED_GEAR_MESHES.has(object.name)) object.visible = false;
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const normalized = new Group();
    normalized.add(model);
    normalized.scale.setScalar(FLIGHT_MODEL_LENGTH / size.z);
    // The supplied model is +Y up, nose +Z; the game's vehicle convention is nose -Z.
    normalized.rotation.y = Math.PI;
    return normalized;
  }, [scene]);

  useEffect(() => { onReady?.(); }, [onReady]);
  // Materials, textures and geometry belong to useGLTF's shared cache.
  return <primitive object={aircraft} dispose={null} />;
}

function FallbackAircraft({ onReady }: FlightModelProps) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return <ExteriorAircraft />;
}

class ModelErrorBoundary extends Component<{ children: ReactNode; onReady?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <FallbackAircraft onReady={this.props.onReady} /> : this.props.children;
  }
}

/** Centered exterior, 24m long, +Y up and nose -Z. Parent groups own its flight path. */
export function FlightModel({ onReady }: FlightModelProps) {
  return <ModelErrorBoundary onReady={onReady}>
    <Suspense fallback={<ExteriorAircraft />}>
      <ImportedAircraft onReady={onReady} />
    </Suspense>
  </ModelErrorBoundary>;
}
