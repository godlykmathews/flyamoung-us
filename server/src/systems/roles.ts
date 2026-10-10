import { randomInt } from 'node:crypto';
import type { Allegiance, Role } from '../../../shared/protocol.js';

// A small crew always has someone visibly assigned to cabin service. This job
// selection remains independent from the separate hidden-allegiance shuffle.
const ROLES: Role[] = ['Captain', 'Cabin Crew', 'Air Marshal', 'Engineer', 'First Officer', 'Passenger'];
function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** Public jobs and hidden allegiances are randomized independently. */
export function assignRoles(ids: string[], training: boolean) {
  const jobs = shuffled(ids);
  const saboteurs = new Set(training ? [] : shuffled(ids).slice(0, ids.length >= 8 ? 2 : 1));
  return new Map(ids.map(id => [id, {
    role: ROLES[jobs.indexOf(id)] ?? (jobs.indexOf(id) % 2 === 0 ? 'Cabin Crew' : 'Passenger') as Role,
    allegiance: (saboteurs.has(id) ? 'saboteur' : 'crew') as Allegiance,
  }]));
}
