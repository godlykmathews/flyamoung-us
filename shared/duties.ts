import type { Role } from './protocol.js';
import { TASKS } from './tasks.js';

export const ROLE_BRIEFS: Record<Role, string> = {
 Captain: 'Fly and stabilize the aircraft. Complete departure, cruise and landing checks.',
 'First Officer': 'Verify the route, scan the weather and manage arrival radio checks.',
 'Cabin Crew': 'Demonstrate safety, prepare and deliver service, seat passengers and give first aid.',
 Engineer: 'Inspect circuits and pressure, secure equipment and repair aircraft incidents.',
 'Air Marshal': 'Inspect security records and access seals. Disarm visible armed threats.',
 Passenger: 'Stow your bags, review the safety card, prepare your seat and enjoy cabin service.',
};
const DUTY_ROLES = new Map<string, Role>([
 ...['service','safety-demo','guide-passenger','secure-cart','cabin-check','assist-mask','aid-pilot','rescue-player','calm-passenger'].map(duty => [duty, 'Cabin Crew'] as [string,Role]),
 ...['secure-equipment','repair-pressure','extinguish-smoke'].map(duty => [duty, 'Engineer'] as [string,Role]),
 ['flight-control','Captain'], ['disarm','Air Marshal'],
 ...['request-service','read','rest'].map(duty => [duty,'Passenger'] as [string,Role]),
]);
const PERSONAL = new Set(['fasten-seatbelt','use-mask']);
// These still require private terrorist allegiance in the authoritative server.
const COVERT = new Set(['wrong-order','poison-pilot','damage-pressure','damage-electrical']);
export function roleForDuty(duty: string): Role | undefined { return DUTY_ROLES.get(duty); }
export function canPerformDuty(role: Role, duty: string, training = false): boolean {
 if (PERSONAL.has(duty) || COVERT.has(duty)) return true;
 const owner = roleForDuty(duty);
 return owner !== undefined && (training || owner === role);
}
export function canDoTask(role: Role, taskId: string, training = false): boolean {
 const task = TASKS.find(entry => entry.id === taskId);
 return !!task && (training || task.role === role);
}
