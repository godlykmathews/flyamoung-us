export const EYE_HEIGHT = 1.68;
export const WALK_SPEED = 3.1;
export const PLAYER_RADIUS = 0.23;
export const TASKS = [
 { id:'checklist', name:'Preflight checklist', area:'Flight deck', hint:'Confirm the illuminated checks in order.', x:-1.25, z:-12, color:'#82cfc0' },
 { id:'navigation', name:'Verify flight route', area:'Flight deck', hint:'Repeat the waypoint sequence.', x:1.25, z:-12, color:'#98b6e7' },
 { id:'seatbelts', name:'Inspect seatbelts', area:'Passenger cabin', hint:'Check the highlighted seat rows in order.', x:0.95, z:-3.9, color:'#e8bb71' },
 { id:'meals', name:'Prepare cabin service', area:'Aft galley', hint:'Pack the meal trays in the shown order.', x:-2.0, z:9.4, color:'#dba0ad' },
 { id:'electrical', name:'Calibrate power relay', area:'Maintenance bay', hint:'Reconnect the highlighted circuits in order.', x:2.0, z:12.3, color:'#c1b0e5' }
] as const;
export type TaskId = typeof TASKS[number]['id'];
export const SEAT_ROWS = [-7,-4,-1,2,5];
export interface Obstacle { x: number; z: number; w: number; d: number; }
export const OBSTACLES: Obstacle[] = [
 ...SEAT_ROWS.flatMap(z => [-1,1].map(side=>({x:side*1.85,z,w:2.0,d:1.25}))),
 {x:-1.65,z:-10,w:2.5,d:0.18},{x:1.65,z:-10,w:2.5,d:0.18},
 {x:-1.65,z:-12.65,w:1.55,d:1.6},{x:1.65,z:-12.65,w:1.55,d:1.6},
 {x:-2.4,z:9.4,w:1.0,d:2.1},{x:2.4,z:12.3,w:1.0,d:2.1}
];
export function canStand(x: number,z: number): boolean {
 if (!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>2.95-PLAYER_RADIUS||z < -13.6+PLAYER_RADIUS||z>13.8-PLAYER_RADIUS) return false;
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
export function areaAt(z:number) { return z < -10 ? 'FLIGHT DECK' : z > 10.5 ? 'MAINTENANCE BAY' : z > 7 ? 'AFT GALLEY' : 'PASSENGER CABIN'; }
