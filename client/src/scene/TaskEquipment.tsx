import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EquipmentId } from '../../../shared/tasks';

type Vec3 = [number, number, number];
const block = new RoundedBoxGeometry(1, 1, 1, 2, .075);
const flat = new THREE.PlaneGeometry(1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);
const ring = new THREE.TorusGeometry(1, .16, 7, 22);
const steel = new THREE.MeshStandardMaterial({ color: '#b0bcc4', metalness: .78, roughness: .3 });
const satin = new THREE.MeshStandardMaterial({ color: '#6f8190', metalness: .65, roughness: .45 });
const housing = new THREE.MeshStandardMaterial({ color: '#334653', metalness: .15, roughness: .65 });
const rubber = new THREE.MeshStandardMaterial({ color: '#17212a', roughness: .94 });
const white = new THREE.MeshStandardMaterial({ color: '#eff0ea', roughness: .43 });
const navy = new THREE.MeshStandardMaterial({ color: '#203c59', roughness: .86 });
const blue = new THREE.MeshStandardMaterial({ color: '#3f89ac', roughness: .5 });
const red = new THREE.MeshStandardMaterial({ color: '#a8352c', roughness: .65 });
const coffee = new THREE.MeshStandardMaterial({ color: '#321e12', roughness: .23 });
const amber = new THREE.MeshStandardMaterial({ color: '#e7ae4f', emissive: '#b27829', emissiveIntensity: .4 });
const verified = new THREE.MeshStandardMaterial({ color: '#77c7ab', emissive: '#409777', emissiveIntensity: .4 });

function Part({ position = [0, 0, 0], scale, material = housing, rotation }: { position?: Vec3; scale: Vec3; material?: THREE.Material; rotation?: Vec3 }) {
  return <mesh geometry={block} material={material} position={position} scale={scale} rotation={rotation} castShadow receiveShadow />;
}
function Round({ position, scale, material = steel, rotation }: { position: Vec3; scale: Vec3; material?: THREE.Material; rotation?: Vec3 }) {
  return <mesh geometry={cylinder} material={material} position={position} scale={scale} rotation={rotation} castShadow />;
}
function Screw({ x, y, z }: { x: number; y: number; z: number }) {
  return <group position={[x, y, z]}>
    <Round position={[0, 0, 0]} scale={[.011, .006, .011]} rotation={[Math.PI / 2, 0, 0]} />
    <Part position={[0, 0, .004]} scale={[.013, .002, .002]} material={rubber} rotation={[0, 0, .5]} />
  </group>;
}
function Lamp({ done, position }: { done: boolean; position: Vec3 }) {
  return <group position={position}>
    <Round position={[0, 0, 0]} scale={[.017, .012, .017]} material={rubber} rotation={[Math.PI / 2, 0, 0]} />
    <Round position={[0, 0, .009]} scale={[.011, .009, .011]} material={done ? verified : amber} rotation={[Math.PI / 2, 0, 0]} />
  </group>;
}

/** Small printed labels are baked into local textures; no DOM or floating signs. */
function PrintedLabel({ text, position, size, background = '#273c4a', ink = '#dbe6e9', rotation }: {
  text: string; position: Vec3; size: [number, number]; background?: string; ink?: string; rotation?: Vec3;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.max(96, Math.round(512 * size[1] / size[0]));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const lines = text.split('\n');
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fontSize = Math.min(45, canvas.height / (lines.length * 1.65));
    lines.forEach((line, i) => { ctx.font = `${i ? 400 : 600} ${fontSize}px monospace`; ctx.fillText(line, 256, (i + .5) * canvas.height / lines.length, 478); });
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return map;
  }, [text, size[0], size[1], background, ink]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: .83, transparent: background === 'transparent', alphaTest: background === 'transparent' ? .1 : 0 }), [texture, background]);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);
  return <mesh geometry={flat} material={material} position={position} rotation={rotation} scale={[size[0], size[1], 1]} />;
}

function ChecklistPaper({ done }: { done: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f1e7'; ctx.fillRect(0, 0, 384, 512);
    ctx.fillStyle = '#274660'; ctx.fillRect(25, 43, 334, 45);
    ctx.font = 'bold 20px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText('CREW STATUS', 41, 72);
    ctx.fillStyle = '#637078'; ctx.font = '12px monospace'; ctx.fillText('F404  /  CABIN READINESS', 30, 111);
    const lines = ['Cabin secure', 'Door indicators', 'Crew stations', 'Flight briefing'];
    lines.forEach((line, i) => {
      const y = 161 + i * 60;
      ctx.strokeStyle = '#65717b'; ctx.lineWidth = 2; ctx.strokeRect(31, y - 13, 18, 18);
      if (done) { ctx.beginPath(); ctx.moveTo(34, y - 4); ctx.lineTo(40, y + 1); ctx.lineTo(48, y - 12); ctx.strokeStyle = '#28717b'; ctx.stroke(); }
      ctx.fillStyle = '#3b444c'; ctx.font = '17px Arial'; ctx.fillText(line, 62, y);
      ctx.strokeStyle = '#d3d2ca'; ctx.beginPath(); ctx.moveTo(28, y + 20); ctx.lineTo(356, y + 20); ctx.stroke();
    });
    ctx.fillStyle = '#7a8386'; ctx.font = '12px monospace'; ctx.fillText('INITIALS: ______  FLT: 404', 30, 445);
    ctx.fillStyle = '#9dabae'; for (let x = 31; x < 290; x += 7) ctx.fillRect(x, 467, 2 + x % 3, 20);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; return map;
  }, [done]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: .95 }), [texture]);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);
  return <mesh geometry={flat} material={material} position={[0, -.012, .021]} scale={[.37, .48, 1]} />;
}
function CrewClipboard({ done }: { done: boolean }) {
  return <group rotation={[-.35, 0, 0]}>
    <Part scale={[.43, .57, .036]} material={navy} />
    <ChecklistPaper done={done} />
    <Part position={[0, .247, .034]} scale={[.16, .055, .027]} material={steel} />
    <Part position={[0, .241, .051]} scale={[.12, .022, .011]} material={satin} />
    <Round position={[.237, -.035, .027]} scale={[.0105, .34, .0105]} material={navy} />
    <Round position={[.237, .145, .027]} scale={[.011, .045, .011]} material={steel} />
    <Part position={[.24, .08, .037]} scale={[.009, .1, .012]} material={steel} />
    <Part position={[0, -.29, -.022]} scale={[.37, .03, .10]} material={satin} />
  </group>;
}

function RouteDisplay({ done }: { done: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#07161c'; ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#e5edf0'; ctx.font = '24px monospace'; ctx.fillText('ACT RTE 1', 141, 41);
    ctx.font = '15px monospace'; ctx.fillStyle = '#7cb6b8'; ctx.fillText('ORIGIN', 21, 81); ctx.fillText('DEST', 354, 81);
    ctx.font = '25px monospace'; ctx.fillStyle = '#f3f4e9'; ctx.fillText('VIDP', 21, 116); ctx.fillText('WSSS', 354, 116);
    ctx.strokeStyle = '#7eacb3'; ctx.beginPath(); ctx.moveTo(24, 143); ctx.lineTo(488, 143); ctx.stroke();
    ctx.font = '16px monospace'; ctx.fillStyle = '#7cb6b8'; ctx.fillText('VIA', 24, 174); ctx.fillText('TO', 345, 174);
    ['DCT     →      NOVA', 'DCT     →      KILO', 'DCT     →      LIMA', 'DCT     →      ECHO'].forEach((line, i) => {
      ctx.fillStyle = i === 1 ? '#c782c9' : '#e4efeb'; ctx.font = '21px monospace'; ctx.fillText(line, 26, 200 + i * 35);
    });
    ctx.fillStyle = done ? '#8cd7b5' : '#e4bc70'; ctx.font = '19px monospace'; ctx.fillText(done ? 'ROUTE VERIFIED' : 'VERIFY SEQUENCE', 28, 356);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; return map;
  }, [done]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);
  // Bezel front is at .064 m; keep the display beyond it to avoid occlusion.
  return <mesh geometry={flat} material={material} position={[0, .12, .067]} scale={[.34, .255, 1]} />;
}
function FlightManagementUnit({ done }: { done: boolean }) {
  return <group rotation={[-.28, 0, 0]}>
    <Part scale={[.49, .58, .115]} material={housing} />
    <Part position={[0, .12, .054]} scale={[.374, .29, .02]} material={rubber} />
    <RouteDisplay done={done} />
    {[-1, 1].flatMap(side => Array.from({ length: 4 }, (_, row) => <Part key={`${side}-${row}`} position={[side * .211, .22 - row * .067, .065]} scale={[.034, .018, .014]} material={rubber} />))}
    {Array.from({ length: 24 }, (_, i) => <Part key={i} position={[-.176 + (i % 6) * .07, -.065 - Math.floor(i / 6) * .052, .07]} scale={[.05, .035, .027]} material={i === 23 ? blue : rubber} />)}
    <PrintedLabel text={'INIT  RTE  DEP  ARR  VNAV\nA    B    C    D    E    F\n1    2    3    4    5    6\n7    8    9    0   CLR  EXE'} position={[0, -.142, .085]} size={[.416, .188]} background='transparent' ink='#e7eff3' />
    <Lamp done={done} position={[.209, -.248, .061]} />
    <PrintedLabel text='FLIGHT MANAGEMENT' position={[-.025, -.254, .061]} size={[.31, .026]} />
    {[-1, 1].flatMap(x => [-1, 1].map(y => <Screw key={`${x}${y}`} x={x * .224} y={y * .268} z={.062} />))}
  </group>;
}

function SeatbeltInspection({ done }: { done: boolean }) {
  return <group>
    <Part scale={[.59, .39, .041]} material={navy} />
    <PrintedLabel text='SEAT BELT · ROW 02' position={[0, .141, .026]} size={[.5, .048]} background='#203c59' />
    <Part position={[-.175, -.01, .045]} scale={[.23, .083, .014]} material={rubber} rotation={[0, 0, -.035]} />
    <Part position={[.188, -.007, .047]} scale={[.2, .083, .014]} material={rubber} rotation={[0, 0, .025]} />
    <Part position={[-.046, -.012, .065]} scale={[.12, .105, .048]} material={steel} />
    <Part position={[-.046, -.005, .092]} scale={[.106, .079, .014]} material={satin} rotation={done ? [0, 0, 0] : [-.2, 0, 0]} />
    <Part position={[-.046, .016, .102]} scale={[.059, .021, .008]} material={navy} />
    <Part position={[done ? .04 : .075, -.01, .067]} scale={[.082, .061, .014]} material={steel} />
    <Part position={[done ? .047 : .082, -.01, .076]} scale={[.025, .025, .002]} material={rubber} />
    {[-.19, -.14, .17, .22].map(x => <Part key={x} position={[x, -.01, .054]} scale={[.002, .069, .002]} material={satin} />)}
    <PrintedLabel text={done ? 'LATCH / WEBBING VERIFIED' : 'LATCH  ·  WEBBING  ·  RELEASE'} position={[0, -.13, .027]} size={[.47, .041]} background='#203c59' ink='#c5d4df' />
    {[-1, 1].flatMap(x => [-1, 1].map(y => <Screw key={`${x}${y}`} x={x * .273} y={y * .173} z={.025} />))}
  </group>;
}

const cupGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(.005, 0), new THREE.Vector2(.038, 0), new THREE.Vector2(.046, .088),
  new THREE.Vector2(.039, .091), new THREE.Vector2(.032, .012), new THREE.Vector2(.005, .012),
], 24);
function CoffeeCup({ position }: { position: Vec3 }) {
  return <group position={position}>
    <mesh geometry={cupGeometry} material={white} castShadow />
    <mesh geometry={ring} material={white} position={[.049, .05, 0]} scale={[.027, .03, .027]} />
    <Round position={[0, .076, 0]} scale={[.037, .001, .037]} material={coffee} />
  </group>;
}
function ServiceGalley({ done }: { done: boolean }) {
  return <group>
    <Part position={[-.29, .005, .04]} scale={[.59, .025, .39]} material={satin} />
    {[-1, 1].map(side => <Part key={side} position={[-.29 + side * .281, .022, .04]} scale={[.015, .04, .39]} material={steel} />)}
    {[-1, 1].map(side => <Part key={side} position={[-.29, .022, .04 + side * .183]} scale={[.56, .04, .016]} material={steel} />)}
    <Part position={[-.37, .025, .055]} scale={[.2, .008, .22]} material={white} />
    <Part position={[-.39, .032, .073]} scale={[.16, .006, .17]} material={white} rotation={[0, -.04, 0]} />
    <Round position={[-.2, .033, .092]} scale={[.075, .012, .075]} material={white} />
    <CoffeeCup position={[-.2, .04, .09]} />
    <Round position={[-.1, .122, -.071]} scale={[.043, .19, .043]} material={blue} />
    <Round position={[-.1, .227, -.071]} scale={[.024, .045, .024]} material={white} />
    <PrintedLabel text='WATER' position={[-.1, .137, -.027]} size={[.069, .057]} background='#eff0ea' ink='#28648c' />
    <Part position={[-.48, .04, .019]} scale={[.022, .011, .15]} material={steel} />
    <Part position={[-.48, .045, -.065]} scale={[.04, .012, .045]} material={steel} />
    <Part position={[.41, .225, -.12]} scale={[.39, .45, .3]} material={housing} />
    <Part position={[.41, .24, .038]} scale={[.31, .29, .018]} material={rubber} />
    <Part position={[.41, .06, .075]} scale={[.34, .035, .20]} material={steel} />
    <Part position={[.41, .236, .087]} scale={[.08, .06, .095]} material={steel} />
    <Round position={[.41, .181, .12]} scale={[.012, .055, .012]} material={steel} />
    <PrintedLabel text='CABIN COFFEE\nREADY' position={[.41, .344, .055]} size={[.24, .069]} background='#0b252e' ink='#a3d8d9' />
    <CoffeeCup position={[.41, .079, .087]} />
    <Lamp done={done} position={[.544, .367, .043]} />
    <PrintedLabel text='SERVICE 02' position={[.41, .446, .031]} size={[.27, .045]} />
  </group>;
}
function CircuitPanel({ done }: { done: boolean }) {
  return <group>
    <Part scale={[1.51, 1.09, .075]} material={satin} />
    <Part position={[0, 0, .041]} scale={[1.43, 1.01, .013]} material={housing} />
    <PrintedLabel text='CABIN CIRCUIT DISTRIBUTION' position={[0, .419, .052]} size={[1.17, .066]} />
    {['CABIN', 'GALLEY', 'SEATS', 'COMMS'].map((label, i) => {
      const x = -.51 + i * .34;
      return <group key={label} position={[x, -.005, .063]}>
        <Part scale={[.284, .61, .023]} material={rubber} />
        <PrintedLabel text={`${label}\n115V AC`} position={[0, .22, .014]} size={[.226, .09]} background='#17212a' />
        <Round position={[0, .065, .025]} scale={[.059, .026, .059]} material={steel} rotation={[Math.PI / 2, 0, 0]} />
        <Round position={[0, .065, .047]} scale={[.039, .04, .039]} material={rubber} rotation={[Math.PI / 2, 0, 0]} />
        <Part position={[0, .089, .081]} scale={[.037, .101, .04]} material={satin} rotation={[done ? -.22 : .17, 0, 0]} />
        <PrintedLabel text='ON\nOFF' position={[.094, .064, .014]} size={[.055, .10]} background='#17212a' />
        <Round position={[0, -.148, .026]} scale={[.033, .035, .033]} material={i === 3 ? red : rubber} rotation={[Math.PI / 2, 0, 0]} />
        <PrintedLabel text={`CB 0${i + 1}`} position={[0, -.251, .015]} size={[.19, .035]} background='#17212a' ink='#a8b7c2' />
      </group>;
    })}
    <PrintedLabel text={done ? 'BUS A  —  ALL CIRCUITS VERIFIED' : 'BUS A  —  VERIFY BREAKER POSITIONS'} position={[-.045, -.427, .053]} size={[1.12, .048]} />
    <Lamp done={done} position={[.607, -.426, .056]} />
    {[-1, 1].flatMap(x => [-1, 1].map(y => <Screw key={`${x}${y}`} x={x * .722} y={y * .511} z={.045} />))}
  </group>;
}

/** Original modular station art. Replace individual variants with GLBs at these same mounts. */
export function TaskEquipment({ taskId, done }: { taskId: EquipmentId; done: boolean }) {
  if (taskId === 'checklist') return <CrewClipboard done={done} />;
  if (taskId === 'navigation') return <FlightManagementUnit done={done} />;
  if (taskId === 'seatbelts') return <SeatbeltInspection done={done} />;
  if (taskId === 'meals') return <ServiceGalley done={done} />;
  return <CircuitPanel done={done} />;
}
