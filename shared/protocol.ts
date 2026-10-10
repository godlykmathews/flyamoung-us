export type Phase = 'lobby' | 'playing' | 'meeting' | 'ended';
export type Role = 'Captain' | 'First Officer' | 'Cabin Crew' | 'Engineer' | 'Air Marshal' | 'Passenger';
export type Allegiance = 'crew' | 'saboteur';
export type SabotageKind = 'blackout' | 'comms' | 'navigation';
export type ServiceItem = 'water' | 'coffee' | 'meal' | 'blanket';
export interface ServiceRequest { id: string; item: ServiceItem; remaining: number; claimedBy: string | null; }
export interface CabinNpc { id: string; name: string; kind: 'pilot' | 'passenger' | 'attendant'; model: string; x: number; z: number; yaw: number; alive: boolean; pose: 'seated' | 'idle' | 'walking' | 'serving' | 'dead' | 'standing' | 'sitting'; homeX: number; homeZ: number; needsSeat: boolean; seat: string | null; request: ServiceRequest | null; carriedItem: ServiceItem | null; }
export interface CabinServiceState { served: number; missed: number; satisfaction: number; }
export interface ImpostorObjective { id: 'disrupt-system' | 'eliminate-npc' | 'tamper-galley'; label: string; completed: boolean; }
export type ImpostorTool = 'knife' | 'rope' | 'bomb';
export interface Player { id: string; name: string; color: string; x: number; z: number; yaw: number; role: Role; ready: boolean; detained: boolean; model: 'crew-man' | 'attendant-player' | 'pilot' | 'marshal' | 'engineer' | 'passenger-a'; weaponDrawn: boolean; equippedTool: ImpostorTool | null; carriedItem: ServiceItem | null; }
export interface TaskState { id: string; completed: boolean; completedBy: string; }
export interface FlightState { mode: 'autopilot' | 'manual'; altitude: number; airspeed: number; heading: number; progress: number; }
export interface ChatMessage { id: number; name: string; text: string; system: boolean; }
export type JourneyStage = 'departure' | 'service' | 'turbulence' | 'approach';
export type SafetyInstruction = 'seatbelt' | 'oxygen' | 'lifevest' | 'exits';
export interface SafetyChallenge { token: string; cards: SafetyInstruction[]; }
export interface SafetyDemoState { status: 'idle' | 'arranging' | 'demonstrating' | 'complete'; operatorId: string | null; step: number; elapsed: number; }
export const SAFETY_STEP_DURATION = 4;
export const SAFETY_STEP_DURATIONS = [14.5, 4, 4, 4] as const;
export const SAFETY_INSTRUCTIONS: ReadonlyArray<{ id: SafetyInstruction; title: string; description: string; order: number }> = [
 { id: 'seatbelt', title: 'Fasten your seatbelt', description: 'Show how to fasten, tighten and release the seatbelt.', order: 0 },
 { id: 'oxygen', title: 'Fit your oxygen mask', description: 'Place the mask over your nose and mouth. Secure yours before helping others.', order: 1 },
 { id: 'lifevest', title: 'Put on your life vest', description: 'Slip the vest over your head, secure the strap and inflate only outside the aircraft.', order: 2 },
 { id: 'exits', title: 'Locate the exits', description: 'Point out the nearest exits and the illuminated aisle path.', order: 3 },
];
export type WorldActionKind = 'guide-passenger' | 'secure-cart' | 'secure-equipment' | 'cabin-check';
export interface HeldAction { playerId: string; kind: WorldActionKind; targetId: string; progress: number; duration: number; }
export interface JourneyObjective { id: string; label: string; role: Role; current: number; target: number; }
export interface JourneyState { stage: JourneyStage; title: string; instruction: string; elapsed: number; seatbeltSign: boolean; objectives: JourneyObjective[]; turbulence: { active: boolean; roll: number; pitch: number; stability: number; required: number; operatorId: string | null; }; }
export type IncidentKind = 'none' | 'decompression' | 'smoke';
export type ExperienceActionKind = 'fasten-seatbelt' | 'read' | 'rest' | 'use-mask' | 'assist-mask' | 'repair-pressure' | 'extinguish-smoke' | 'aid-pilot' | 'rescue-player' | 'disarm' | 'wrong-order' | 'calm-passenger' | 'poison-pilot' | 'damage-pressure' | 'damage-electrical';
export interface PassengerExperience { order: ServiceRequest | null; received: ServiceItem[]; seatbelt: boolean; oxygenMask: boolean; activity: 'idle' | 'reading' | 'resting'; incapacitated: boolean; }
export interface ExperienceAction { playerId: string; kind: ExperienceActionKind | 'working'; targetId: string; progress: number; duration: number; }
export interface ExperienceState { incident: IncidentKind; severity: number; remaining: number; masksDeployed: boolean; pilotCondition: 'healthy' | 'poisoned' | 'recovering'; pilotRecovery: number; agitated: string[]; players: Record<string, PassengerExperience>; actions: ExperienceAction[]; }
export const EXPERIENCE_ACTION_DURATIONS: Record<ExperienceActionKind, number> = { 'fasten-seatbelt': 1.8, read: 3, rest: 4, 'use-mask': 2, 'assist-mask': 3, 'repair-pressure': 6, 'extinguish-smoke': 5, 'aid-pilot': 5, 'rescue-player': 4, disarm: 2.5, 'wrong-order': 2, 'calm-passenger': 3, 'poison-pilot': 3, 'damage-pressure': 4, 'damage-electrical': 4 };
export type OperationsStage = 'boarding' | 'takeoff' | 'cruise' | 'landing' | 'crashed' | 'arrived';
export interface BoardingMember { playerId: string; documentsReceived: boolean; boarded: boolean; }
export interface OperationsState { stage: OperationsStage; elapsed: number; altitude: number; airspeed: number; throttle: number; pitch: number; roll: number; runwayProgress: number; runwayOffset: number; distance: number; gearDown: boolean; brakes: boolean; operatorId: string | null; landingReady: boolean; roster: BoardingMember[]; bomb: { x: number; z: number; remaining: number; disarmProgress: number } | null; restraints: Record<string, number>; crashReason: string; crashProgress: number; }
export const BOARDING_DOCUMENTS = { x: -2.4, z: 9.4, radius: 2.3 } as const;
export const BOARDING_ENTRANCE = { x: .8, z: 5.4, radius: 1.8 } as const;
export interface Snapshot { roomId: string; hostId: string; training: boolean; phase: Phase; players: Player[]; tasks: TaskState[]; integrity: number; remaining: number; sabotage: SabotageKind | null; sabotageRemaining: number; meetingRemaining: number; votes: Record<string,string>; winner: Allegiance | null; outcome: string; flight: FlightState; chat: ChatMessage[]; npcs: CabinNpc[]; service: CabinServiceState; story: JourneyState; safety: SafetyDemoState; interactions: HeldAction[]; experience: ExperienceState; operations: OperationsState; }
export interface Secret { inventory: ImpostorTool[]; allegiance: Allegiance; teammates: string[]; cooldown: number; killCooldown: number; objectives: ImpostorObjective[]; }
export interface MoveInput { dx: number; dz: number; yaw: number; }
export interface TaskChallenge { taskId: string; token: string; sequence: number[]; }
export const COLORS = ['#e5aa56','#79bfb2','#98a8dc','#cd8392','#b5ba72','#c199db','#6eb8d0','#e2bb90','#d0d8d4','#aa9283'];
export const CLIENT_MESSAGES = ['sync','ready','start','move','beginTask','completeTask','sabotage','repair','report','vote','chat','restart','pickUpService','servePassenger','killNpc','impostorTask','beginAction','maintainAction','cancelAction','flightControl','drawWeapon','beginSafety','submitSafety','cancelSafety','requestService','servePlayer','attackPlayer','experienceAction','incidentDrill','boardingAction','startTakeoff','startLanding','aircraftControl','equipTool','useTool','oxygenCut','disarmBomb','releaseRestraint'] as const;
