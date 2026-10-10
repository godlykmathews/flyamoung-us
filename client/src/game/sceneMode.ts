import type { Snapshot } from '../../../shared/protocol';

export type SceneMode = 'intro' | 'gate' | 'cabin' | 'journey-flight' | 'departure' | 'emergency';

/** HUD and 3D routing must agree on the authenticated player's boarding receipt. */
export function isJourneyExterior(snapshot: Snapshot, meId: string) {
 const op = snapshot.operations;
 return !!op && (snapshot.phase === 'lobby'
  || op.stage === 'boarding' && !op.roster.find(entry => entry.playerId === meId)?.boarded
  || ['takeoff', 'landing', 'crashed', 'arrived'].includes(op.stage));
}

export function sceneMode(snapshot: Snapshot | null, meId: string, departing = false, emergencyDescent = false): SceneMode {
 if (snapshot?.operations) {
  if (isJourneyExterior(snapshot, meId)) return snapshot.phase === 'lobby' || snapshot.operations.stage === 'boarding' ? 'gate' : 'journey-flight';
  return 'cabin';
 }
 if (emergencyDescent) return 'emergency';
 if (departing) return 'departure';
 return snapshot ? 'cabin' : 'intro';
}
