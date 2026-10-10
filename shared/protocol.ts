export type Phase = 'lobby' | 'playing' | 'meeting' | 'ended';
export type Role = 'Captain' | 'First Officer' | 'Cabin Crew' | 'Engineer' | 'Passenger';
export type Allegiance = 'crew' | 'saboteur';
export type SabotageKind = 'blackout' | 'comms' | 'navigation';
export interface Player { id: string; name: string; color: string; x: number; z: number; yaw: number; role: Role; ready: boolean; detained: boolean; }
export interface TaskState { id: string; completed: boolean; completedBy: string; }
export interface FlightState { mode: 'autopilot' | 'manual'; altitude: number; airspeed: number; heading: number; progress: number; }
export interface ChatMessage { id: number; name: string; text: string; system: boolean; }
export interface Snapshot { roomId: string; hostId: string; training: boolean; phase: Phase; players: Player[]; tasks: TaskState[]; integrity: number; remaining: number; sabotage: SabotageKind | null; sabotageRemaining: number; meetingRemaining: number; votes: Record<string,string>; winner: Allegiance | null; outcome: string; flight: FlightState; chat: ChatMessage[]; }
export interface Secret { allegiance: Allegiance; teammates: string[]; cooldown: number; }
export interface MoveInput { dx: number; dz: number; yaw: number; }
export interface TaskChallenge { taskId: string; token: string; sequence: number[]; }
export const COLORS = ['#e5aa56','#79bfb2','#98a8dc','#cd8392','#b5ba72','#c199db','#6eb8d0','#e2bb90','#d0d8d4','#aa9283'];
export const CLIENT_MESSAGES = ['sync','ready','start','move','beginTask','completeTask','sabotage','repair','report','vote','chat','restart'] as const;
