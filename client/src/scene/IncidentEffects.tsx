import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BackSide, CanvasTexture, Color, Group, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, Object3D, PointLight, SRGBColorSpace, Vector3, type Material } from 'three';
import type { Snapshot } from '../../../shared/protocol';
import { SEAT_CENTERS, SEAT_ROWS } from '../../../shared/world';

const UP = new Vector3(0, 1, 0);
const MASK_MOUNTS = SEAT_ROWS.flatMap((z, row) => SEAT_CENTERS.map((x, column) => ({ x, z: z - .59, row, column })));
const PANEL_MOUNTS = SEAT_ROWS.flatMap(z => [-1, 1].map(side => ({ x: side * 2.43, z: z - .59 })));
const HOSE_SEGMENTS = 8;

function useReducedMotion() {
  const value = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { value.current = media.matches; };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return value;
}

/** Sky travel is presentation only. The metre-scale cabin and collision world stay level. */
export function IncidentHorizon({ snapshot, children }: { snapshot: Snapshot; children: ReactNode }) {
  const group = useRef<Group>(null);
  const reduced = useReducedMotion();
  useFrame((_, delta) => {
    if (!group.current) return;
    const turbulence = snapshot.story.turbulence;
    const active = snapshot.phase === 'playing' && turbulence.active && !reduced.current;
    group.current.rotation.z = MathUtils.damp(group.current.rotation.z, active ? turbulence.roll * -.045 : 0, 1.8, Math.min(delta, .1));
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, active ? turbulence.pitch * -.025 : 0, 1.8, Math.min(delta, .1));
  });
  return <group ref={group}>{children}</group>;
}

/** Twenty real mesh masks share four material draws; hoses and hatches are also instanced. */
function DroppingOxygenMasks({ deployed, turbulence, moving }: { deployed: boolean; turbulence: number; moving: boolean }) {
  const { scene } = useGLTF('/models/safety/oxygen-mask.glb', false, false);
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: { geometry: Mesh['geometry']; material: Material | Material[]; matrix: Matrix4 }[] = [];
    scene.traverse(node => {
      if (node instanceof Mesh) meshes.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() });
    });
    return meshes;
  }, [scene]);
  const masks = useRef<InstancedMesh[]>([]), hoses = useRef<InstancedMesh>(null), hatches = useRef<InstancedMesh>(null);
  const progress = useRef(0), time = useRef(0), reduced = useReducedMotion();
  const scratch = useMemo(() => ({ transform: new Object3D(), matrix: new Matrix4(), a: new Vector3(), b: new Vector3(), direction: new Vector3(), normalized: new Vector3() }), []);
  useEffect(() => {
    const instances = [...masks.current];
    return () => instances.forEach(mesh => mesh.dispose());
  }, [parts]);
  useFrame((_, dt) => {
    const delta = Math.min(dt, .1);
    if (moving) time.current += delta;
    progress.current = MathUtils.damp(progress.current, deployed ? 1 : 0, deployed ? 3.4 : 2, delta);
    const p = progress.current;
    const { transform, matrix, a, b, direction, normalized } = scratch;
    if (hatches.current) {
      PANEL_MOUNTS.forEach((mount, i) => {
        const angle = p * 1.38;
        transform.position.set(mount.x, 2.25 - Math.sin(angle) * .15, mount.z - .16 + Math.cos(angle) * .15);
        transform.rotation.set(angle, 0, 0); transform.scale.set(1.26, .025, .3); transform.updateMatrix();
        hatches.current!.setMatrixAt(i, transform.matrix);
      });
      hatches.current.instanceMatrix.needsUpdate = true;
    }
    const visible = p > .035;
    masks.current.forEach(mesh => { if (mesh) mesh.visible = visible; });
    if (hoses.current) hoses.current.visible = visible;
    if (!visible) return;
    MASK_MOUNTS.forEach((mount, i) => {
      const sway = reduced.current ? 0 : (.022 + turbulence * .075) * p;
      const swingX = Math.sin(time.current * 1.55 + i * .43) * sway;
      const swingZ = Math.cos(time.current * 1.82 + i * .29) * sway * .6;
      const drop = .72 * MathUtils.smoothstep(p, .08, 1);
      const maskY = 2.22 - drop;
      transform.position.set(mount.x + swingX, maskY, mount.z + swingZ);
      transform.rotation.set(swingZ * 1.8, Math.PI + Math.sin(i * 7) * .18, -swingX * 1.2);
      transform.scale.setScalar(MathUtils.smoothstep(p, .035, .16)); transform.updateMatrix();
      parts.forEach((part, partIndex) => {
        matrix.multiplyMatrices(transform.matrix, part.matrix);
        masks.current[partIndex]?.setMatrixAt(i, matrix);
      });
      const point = (t: number, target: Vector3) => target.set(
        mount.x + swingX * t + Math.sin(t * Math.PI) * .045 * p,
        2.235 - (drop - .09) * t,
        mount.z + swingZ * t + Math.sin(t * Math.PI) * .026 * p,
      );
      for (let j = 0; j < HOSE_SEGMENTS; j++) {
        point(j / HOSE_SEGMENTS, a); point((j + 1) / HOSE_SEGMENTS, b);
        direction.subVectors(b, a);
        transform.position.copy(a).add(b).multiplyScalar(.5);
        transform.quaternion.setFromUnitVectors(UP, normalized.copy(direction).normalize());
        transform.scale.set(.006, Math.max(.001, direction.length()), .006); transform.updateMatrix();
        hoses.current?.setMatrixAt(i * HOSE_SEGMENTS + j, transform.matrix);
      }
    });
    masks.current.forEach(mesh => { if (mesh) mesh.instanceMatrix.needsUpdate = true; });
    if (hoses.current) hoses.current.instanceMatrix.needsUpdate = true;
  });
  return <group>
    {PANEL_MOUNTS.map((mount, i) => <group key={i} position={[mount.x, 2.29, mount.z]}>
      <mesh><boxGeometry args={[1.31, .065, .36]} /><meshStandardMaterial color="#cfcfc4" roughness={.66} /></mesh>
      <mesh position={[0, -.036, 0]}><boxGeometry args={[1.22, .008, .275]} /><meshStandardMaterial color="#23383c" roughness={.88} /></mesh>
      <mesh position={[0, -.075, -.185]}><boxGeometry args={[.08, .016, .012]} /><meshBasicMaterial color={deployed ? '#edbc6b' : '#82998f'} /></mesh>
    </group>)}
    <instancedMesh ref={hatches} args={[undefined, undefined, PANEL_MOUNTS.length]} frustumCulled={false} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial color="#e5e2d6" roughness={.55} />
    </instancedMesh>
    {parts.map((part, i) => <instancedMesh key={i} ref={mesh => { if (mesh) masks.current[i] = mesh; }} args={[part.geometry, part.material, MASK_MOUNTS.length]} frustumCulled={false} castShadow dispose={null} />)}
    <instancedMesh ref={hoses} args={[undefined, undefined, MASK_MOUNTS.length * HOSE_SEGMENTS]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 5]} /><meshStandardMaterial color="#c0b292" roughness={.82} />
    </instancedMesh>
  </group>;
}

function EscapePath({ active }: { active: boolean }) {
  const material = useRef<MeshBasicMaterial>(null), light = useRef<PointLight>(null), strips = useRef<InstancedMesh>(null), amount = useRef(0);
  useEffect(() => {
    if (!strips.current) return;
    const transform = new Object3D(); let index = 0;
    for (const side of [-1, 1]) for (let i = 0; i < 37; i++) {
      transform.position.set(side * 1.21, .014, -9.2 + i * .72);
      transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.set(.065, .46, 1); transform.updateMatrix();
      strips.current.setMatrixAt(index++, transform.matrix);
    }
    strips.current.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame((_, dt) => {
    const delta = Math.min(dt, .1);
    amount.current = MathUtils.damp(amount.current, active ? 1 : 0, 3, delta);
    if (material.current) material.current.opacity = amount.current * .9;
    if (light.current) light.current.intensity = amount.current * 1.2;
  });
  return <group>
    <instancedMesh ref={strips} args={[undefined, undefined, 74]} frustumCulled={false}>
      <planeGeometry /><meshBasicMaterial ref={material} color="#bce8c5" transparent opacity={0} toneMapped={false} depthWrite={false} />
    </instancedMesh>
    <pointLight ref={light} position={[0, .2, 7.4]} color="#bfe8c7" intensity={0} distance={6} decay={2} />
  </group>;
}

/** Broad, infrequent cloud illumination: no screen flash or rapid lightning strobe. */
function StormLight({ active, moving }: { active: boolean; moving: boolean }) {
  const sky = useRef<Mesh>(null), material = useRef<MeshBasicMaterial>(null), light = useRef<PointLight>(null);
  const time = useRef(0), strength = useRef(0), reduced = useReducedMotion();
  const cloudLight = useMemo(() => new Color('#b0c7d7'), []);
  useFrame(({ camera }, dt) => {
    const delta = Math.min(dt, .1);
    if (moving) time.current += delta;
    strength.current = MathUtils.damp(strength.current, active ? 1 : 0, .65, delta);
    sky.current?.position.copy(camera.position);
    const cycle = time.current % 17;
    const glow = reduced.current ? 0 : Math.sin(MathUtils.clamp((cycle - 10) / 2.8, 0, 1) * Math.PI) ** 2;
    if (material.current) {
      material.current.opacity = strength.current * .52;
      material.current.color.set('#46627d').lerp(cloudLight, glow * .3);
    }
    if (light.current) light.current.intensity = strength.current * glow * 34;
  });
  return <>
    <mesh ref={sky} renderOrder={-19}><sphereGeometry args={[3900, 20, 12]} /><meshBasicMaterial ref={material} color="#46627d" side={BackSide} transparent opacity={0} depthWrite={false} fog={false} /></mesh>
    <pointLight ref={light} position={[-14, 7, -3]} color="#c2ddf5" intensity={0} distance={35} decay={2} />
  </>;
}

/** Soft depth-tested volumes rise from the electrical cabinet instead of covering the camera. */
function ElectricalHaze({ active, moving, severity }: { active: boolean; moving: boolean; severity: number }) {
  const smoke = useRef<InstancedMesh>(null), sparks = useRef<InstancedMesh>(null), amount = useRef(0), time = useRef(0);
  const reduced = useReducedMotion();
  const uniforms = useMemo(() => ({ amount: { value: 0 }, elapsed: { value: 0 } }), []);
  const transform = useMemo(() => new Object3D(), []);
  useFrame((_, dt) => {
    const delta = Math.min(dt, .1);
    if (moving) time.current += delta;
    amount.current = MathUtils.damp(amount.current, active ? Math.max(.4, severity) : 0, 1.5, delta);
    uniforms.amount.value = amount.current;
    uniforms.elapsed.value = time.current;
    if (smoke.current) {
      smoke.current.visible = amount.current > .008;
      for (let i = 0; i < 28; i++) {
        const progress = (time.current * .12 + i / 28) % 1;
        const drift = reduced.current ? i * .21 : time.current * .38 + i * 2.37;
        transform.position.set(2.34 - progress * 1.15 + Math.sin(drift) * .15, 1.35 + Math.min(1.45, progress * 2.4), 12.24 - progress * 2.9 + Math.cos(drift * .7) * .18);
        transform.rotation.set(i, i * .7, i * .37);
        const size = (.12 + progress * .54) * Math.sin(progress * Math.PI) ** .3;
        transform.scale.set(size * 1.2, size * .68, size); transform.updateMatrix();
        smoke.current.setMatrixAt(i, transform.matrix);
      }
      smoke.current.instanceMatrix.needsUpdate = true;
    }
    if (sparks.current) {
      sparks.current.visible = active && !reduced.current;
      for (let i = 0; i < 6; i++) {
        const t = (time.current + i * .071) % 4.8;
        const flight = MathUtils.clamp(t / .52, 0, 1);
        transform.position.set(2.43 - flight * (.22 + i * .07), 1.43 + Math.sin(flight * Math.PI) * .19 - flight * .2, 12.3 + Math.sin(i * 4) * flight * .3);
        transform.rotation.set(i, 0, -.7 + i * .12);
        transform.scale.setScalar(t < .52 ? .009 * Math.sin(flight * Math.PI) : 0); transform.updateMatrix();
        sparks.current.setMatrixAt(i, transform.matrix);
      }
      sparks.current.instanceMatrix.needsUpdate = true;
    }
  });
  return <>
    <instancedMesh ref={smoke} args={[undefined, undefined, 28]} frustumCulled={false} renderOrder={3}>
      <sphereGeometry args={[1, 16, 10]} />
      <shaderMaterial transparent depthWrite={false} uniforms={uniforms}
        vertexShader={`varying vec3 viewNormal;varying vec3 viewPosition;varying vec3 localPosition;
          void main(){localPosition=position;vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);viewPosition=mv.xyz;viewNormal=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);gl_Position=projectionMatrix*mv;}`}
        fragmentShader={`uniform float amount;uniform float elapsed;varying vec3 viewNormal;varying vec3 viewPosition;varying vec3 localPosition;
          void main(){float edge=abs(dot(normalize(viewNormal),normalize(-viewPosition)));float soft=smoothstep(.03,.72,edge);float wisps=.72+.28*sin(localPosition.x*9.+localPosition.y*7.+elapsed*.42)*sin(localPosition.z*8.-elapsed*.3);gl_FragColor=vec4(.36,.39,.40,soft*wisps*amount*.10);}`}
      />
    </instancedMesh>
    <instancedMesh ref={sparks} args={[undefined, undefined, 6]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 3]} /><meshBasicMaterial color="#ffcf83" toneMapped={false} />
    </instancedMesh>
  </>;
}

function PressureConsole({ active }: { active: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#183a43'; ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = '#f0eada'; ctx.font = '500 28px sans-serif'; ctx.fillText('CABIN PRESSURE', 35, 54);
    ctx.font = '600 46px sans-serif'; ctx.fillStyle = active ? '#efbc77' : '#aedbcc'; ctx.fillText(active ? 'RECOVERY' : 'NORMAL', 35, 125);
    ctx.lineWidth = 5; ctx.strokeStyle = active ? '#efbc77' : '#aedbcc'; ctx.beginPath();
    for (let i = 0; i < 9; i++) { const x = 36 + i * 55, y = active ? 203 + Math.sin(i * 1.8) * 24 : 206; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.font = '19px sans-serif'; ctx.fillStyle = '#a3bdbd'; ctx.fillText('CREW SYSTEMS / 404', 35, 284);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }, [active]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={[3.44, 1.55, 9.4]} rotation={[0, -Math.PI / 2, 0]}>
    <mesh castShadow><boxGeometry args={[.9, .68, .095]} /><meshStandardMaterial color="#c6ced0" roughness={.4} metalness={.35} /></mesh>
    <mesh position={[0, .04, .049]}><planeGeometry args={[.76, .475]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    {[-.25, 0, .25].map((x, i) => <mesh key={x} position={[x, -.245, .058]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.028, .032, .023, 12]} /><meshStandardMaterial color={active && i === 1 ? '#eebd7b' : '#6d8b88'} metalness={.3} roughness={.45} /></mesh>)}
  </group>;
}

export function IncidentEffects({ snapshot }: { snapshot: Snapshot }) {
  const experience = snapshot.experience;
  const moving = snapshot.phase === 'playing';
  const emergency = experience.incident !== 'none';
  const weather = snapshot.story.turbulence.active;
  return <>
    <Suspense fallback={null}><DroppingOxygenMasks deployed={experience.masksDeployed} turbulence={weather ? Math.max(.25, Math.abs(snapshot.story.turbulence.roll)) : 0} moving={moving} /></Suspense>
    <EscapePath active={emergency || snapshot.sabotage === 'blackout'} />
    <StormLight active={weather} moving={moving} />
    <ElectricalHaze active={experience.incident === 'smoke'} severity={experience.severity} moving={moving} />
    <PressureConsole active={experience.incident === 'decompression'} />
  </>;
}
