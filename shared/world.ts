export const EYE_HEIGHT = 1.68;
export const WALK_SPEED = 3.1;
export const PLAYER_RADIUS = 0.23;
export const CABIN_HALF_WIDTH = 3.7;
export const SEAT_CENTERS = [-2.95, -1.9, 1.9, 2.95] as const;
export const TASKS = [
 { id:'checklist', name:'Crew systems check', area:'Flight deck', hint:'Confirm each item on the crew checklist.', x:-1.25, z:-12, color:'#82cfc0' },
 { id:'navigation', name:'Verify flight route', area:'Flight deck', hint:'Repeat the waypoint sequence.', x:1.25, z:-12, color:'#98b6e7' },
 { id:'seatbelts', name:'Inspect seatbelts', area:'Passenger cabin', hint:'Check the highlighted seat rows in order.', x:1.55, z:-3.9, color:'#e8bb71' },
 { id:'meals', name:'Prepare cabin service', area:'Aft galley', hint:'Pack the meal trays in the shown order.', x:-2.6, z:9.4, color:'#dba0ad' },
 { id:'electrical', name:'Check cabin circuits', area:'Maintenance bay', hint:'Verify the four circuits on the distribution panel.', x:2.6, z:12.3, color:'#c1b0e5' }
] as const;
export type TaskId = typeof TASKS[number]['id'];
export const SEAT_ROWS = [-7,-4,-1,2,5];
// Passengers share seat coordinates with the Blender cabin; approach points
// stay in the wide aisle and never require walking through seat colliders.
export const NPC_PASSENGER_SEATS = SEAT_ROWS.flatMap((z, row) =>
 (row === 2 ? [0, 1, 2, 3] : [1, 2]).map(column => ({ row, column, x: SEAT_CENTERS[column], z: z - .05 }))
).map((seat, index) => ({
 id: `passenger-${String(index + 1).padStart(2, '0')}`,
 name: `Passenger ${String(index + 1).padStart(2, '0')}`,
 seat: `${String(seat.row + 1).padStart(2, '0')}${'ABCD'[seat.column]}`,
 x: seat.x, z: seat.z, serviceX: Math.sign(seat.x), serviceZ: SEAT_ROWS[seat.row] + 1.02,
 model: (['passenger-a', 'passenger-b', 'passenger-c'] as const)[index % 3],
}));
export const PILOT_NPC = { id: 'pilot', name: 'Captain Morgan', x: -1.65, z: -11.05, yaw: 0 } as const;
export const SERVICE_GALLEY = { x: -2.6, z: 9.4 } as const;
export const AI_GALLEY_STOP = { x: -1.4, z: 9.4 } as const;
export const IMPOSTOR_STATION = { id: 'tamper-galley', x: -2.6, z: 9.4, name: 'Falsify service manifest' } as const;
export interface Obstacle { x: number; z: number; w: number; d: number; }
export const OBSTACLES: Obstacle[] = [
 ...SEAT_ROWS.flatMap(z => [-1,1].map(side=>({x:side*2.45,z,w:2.0,d:1.25}))),
 {x:-2.2,z:-10,w:2.9,d:0.18},{x:2.2,z:-10,w:2.9,d:0.18},
 {x:-1.65,z:-12.65,w:1.55,d:1.6},{x:1.65,z:-12.65,w:1.55,d:1.6},
 {x:-1.65,z:-11.05,w:.85,d:.8},
 {x:-3.05,z:15.5,w:1,d:2.4},{x:3.05,z:15.5,w:1,d:2.4},
 {x:-3.0,z:9.4,w:1.0,d:2.1},{x:3.0,z:12.3,w:1.0,d:2.1}
];
export function canStand(x: number,z: number): boolean {
 if (!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>CABIN_HALF_WIDTH-.05-PLAYER_RADIUS||z < -13.6+PLAYER_RADIUS||z>17.8-PLAYER_RADIUS) return false;
 return !OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+PLAYER_RADIUS && Math.abs(z-o.z)<o.d/2+PLAYER_RADIUS);
}
export function movePlayer(x:number,z:number,dx:number,dz:number,dt:number) {
 const length = Math.hypot(dx,dz); const scale = WALK_SPEED*Math.min(0.1,Math.max(0,dt))/Math.max(1,length);
 const nx=x+dx*scale,nz=z+dz*scale;
 if(canStand(nx,z))x=nx;
 if(canStand(x,nz))z=nz;
 return {x,z};
}
export function nearestTask(x:number,z:number) { return TASKS.find(t=>Math.hypot(x-t.x,z-t.z)<2.25); }
/** Interaction sight across the flight-deck partition must pass its open door.
 * Furniture is deliberately excluded: seated occupants are inside seat bounds.
 */
export function hasCabinSight(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
 if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) return false;
 const wallZ = -10;
 if ((a.z < wallZ && b.z < wallZ) || (a.z > wallZ && b.z > wallZ)) return true;
 if (a.z === b.z) return Math.abs(a.x) < .75 && Math.abs(b.x) < .75;
 const t = (wallZ-a.z)/(b.z-a.z);
 return Math.abs(a.x+(b.x-a.x)*t) < .75;
}
export function areaAt(z:number) { return z > 14 ? 'AFT LOUNGE' : z < -10 ? 'FLIGHT DECK' : z > 10.5 ? 'MAINTENANCE BAY' : z > 7 ? 'AFT GALLEY' : 'PASSENGER CABIN'; }

// Visible equipment is kept in the existing free galley/cabin spaces.
export const INTERACTION_STATIONS = [
 { id: 'service-cart', kind: 'secure-cart', name: 'Secure service trolley', x: -2.55, z: 15.5, duration: 3 },
 { id: 'equipment-locker', kind: 'secure-equipment', name: 'Latch emergency equipment', x: 2.6, z: 12.3, duration: 4 },
 { id: 'cabin-check', kind: 'cabin-check', name: 'Confirm cabin ready for landing', x: 0, z: -8.5, duration: 4 },
] as const;
export const FLIGHT_CONTROL_STATION = { x: .65, z: -11.6, radius: 2.0 } as const;
export const SAFETY_DEMO_STATION = { x: 0, z: -8.6, radius: 2.2 } as const;

// Game-only incident controls; these are fictional interaction points, not aircraft procedures.
export const EXPERIENCE_STATIONS = {
 pressure: { id: 'pressure', name: 'Cabin pressure console', x: 2.6, z: 9.4, radius: 2.25 },
 electrical: { id: 'electrical', name: 'Electrical safety cabinet', x: 2.6, z: 12.3, radius: 2.25 },
 pilot: { id: 'pilot', name: 'Assist the pilot', x: PILOT_NPC.x, z: PILOT_NPC.z, radius: 2.25 },
} as const;
