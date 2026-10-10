import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { ExtrudeGeometry, InstancedMesh, Object3D, PlaneGeometry, Shape, SRGBColorSpace } from 'three';
import { SEAT_CENTERS, SEAT_ROWS } from '../../../shared/world';

const LOGO_URL = '/models/branding/visa-guy-logo.webp';
const SEAT_COUNT = SEAT_ROWS.length * SEAT_CENTERS.length;

/** Rear-facing cloth headrest covers share one logo texture and two draw calls. */
export function SeatbackAds({ fallback = false }: { fallback?: boolean }) {
  const logo = useTexture(LOGO_URL);
  const covers = useRef<InstancedMesh>(null), prints = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const shape = new Shape(), w = .64, h = .18, r = .014;
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const cover = new ExtrudeGeometry(shape, { depth: .003, bevelEnabled: false, curveSegments: 4 });
    // Retain the supplied image's 360:79 proportions, including its portrait.
    return { cover, print: new PlaneGeometry(.53, .53 * 79 / 360) };
  }, []);

  useEffect(() => {
    logo.colorSpace = SRGBColorSpace;
    logo.anisotropy = 4;
    logo.needsUpdate = true;
  }, [logo]);
  useEffect(() => () => { geometry.cover.dispose(); geometry.print.dispose(); }, [geometry]);

  useLayoutEffect(() => {
    const transform = new Object3D();
    const tilt = fallback ? -.09 : .075, rear = fallback ? .460 : .528;
    let index = 0;
    for (const z of SEAT_ROWS) for (const x of SEAT_CENTERS) {
      transform.position.set(x, 1.54, z + rear);
      transform.rotation.set(tilt, 0, 0);
      transform.updateMatrix(); covers.current?.setMatrixAt(index, transform.matrix);
      // Lift the print along the cover normal so it cannot flicker against the cloth.
      transform.translateZ(.0045);
      transform.updateMatrix(); prints.current?.setMatrixAt(index++, transform.matrix);
    }
    for (const mesh of [covers.current, prints.current]) if (mesh) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [fallback]);

  return <group name="seatback-advertisements">
    <instancedMesh name="seatback-ad-cloth" ref={covers} args={[geometry.cover, undefined, SEAT_COUNT]} receiveShadow>
      <meshStandardMaterial color="#f4f0e4" roughness={.96} />
    </instancedMesh>
    <instancedMesh name="seatback-ad-logo" ref={prints} args={[geometry.print, undefined, SEAT_COUNT]} receiveShadow>
      <meshStandardMaterial map={logo} alphaTest={.04} roughness={.96} />
    </instancedMesh>
  </group>;
}
