import type { JourneyStage, Role } from './protocol.js';

export type TaskPanelKind = 'checklist' | 'route' | 'belt' | 'supplies' | 'switches' | 'match' | 'dial';
interface Station {
 id: string; name: string; area: string; hint: string; x: number; z: number; color: string;
 role: Role; stage: JourneyStage; panel: TaskPanelKind; code: string;
 labels: readonly [string, string, string, string]; action: string;
}
// Physical checks use the same catalog in the server, HUD and cabin scene.
// Stage is the planned chapter; doing your own checks early is allowed.
export const TASKS = [
 { id:'checklist', name:'Departure checklist', area:'Flight deck', hint:'Verify the departure checks in the requested order.', x:-1.25,z:-12,color:'#82cfc0',role:'Captain',stage:'departure',panel:'checklist',code:'CAPT / DEPARTURE',labels:['Door indicators','Flight briefing','Crew stations','Takeoff clearance'],action:'Confirm' },
 { id:'navigation', name:'Verify flight route', area:'Flight deck', hint:'Trace the requested waypoints on the navigation display.',x:1.25,z:-12,color:'#98b6e7',role:'First Officer',stage:'departure',panel:'route',code:'FMS / ROUTE',labels:['NOVA','KILO','LIMA','ECHO'],action:'Verify' },
 { id:'seatbelts', name:'Inspect seatbelts',area:'Passenger cabin',hint:'Inspect and latch the seat rows in the requested order.',x:1.55,z:-3.9,color:'#e8bb71',role:'Cabin Crew',stage:'turbulence',panel:'belt',code:'CABIN / SAFETY',labels:['Row 01','Row 02','Row 03','Row 04'],action:'Secure' },
 { id:'meals',name:'Prepare cabin service',area:'Aft galley',hint:'Pack the trolley compartments to match the service manifest.',x:-2.6,z:9.4,color:'#dba0ad',role:'Cabin Crew',stage:'service',panel:'supplies',code:'GALLEY / SERVICE',labels:['Water','Meal tray','Coffee','Cutlery'],action:'Stow' },
 { id:'electrical',name:'Check cabin circuits',area:'Maintenance bay',hint:'Test the four cabin circuits in the requested order.',x:2.6,z:12.3,color:'#c1b0e5',role:'Engineer',stage:'departure',panel:'switches',code:'ELEC / CABIN BUS',labels:['Cabin lights','Galley supply','Seat power','Crew intercom'],action:'Check' },
 { id:'autopilot',name:'Cross-check cruise instruments',area:'Flight deck',hint:'Tune each simulated instrument to its target reading.',x:-.85,z:-12.9,color:'#82cfc0',role:'Captain',stage:'service',panel:'dial',code:'CAPT / CRUISE',labels:['Altitude','Heading','Airspeed','Trim'],action:'Set' },
 { id:'landing-config',name:'Landing configuration',area:'Flight deck',hint:'Run the approach checks before the landing chapter ends.',x:-1.8,z:-10.6,color:'#82cfc0',role:'Captain',stage:'approach',panel:'switches',code:'CAPT / APPROACH',labels:['Approach brief','Landing lights','Flap indication','Gear indication'],action:'Verify' },
 { id:'weather-radar',name:'Weather radar scan',area:'Flight deck',hint:'Adjust the radar controls to complete the weather scan.',x:.85,z:-12.9,color:'#98b6e7',role:'First Officer',stage:'service',panel:'dial',code:'RADAR / WEATHER',labels:['Range','Tilt','Gain','Scan sector'],action:'Tune' },
 { id:'radio',name:'Arrival radio check',area:'Flight deck',hint:'Tune each radio test channel to the requested setting.',x:1.8,z:-10.7,color:'#98b6e7',role:'First Officer',stage:'approach',panel:'dial',code:'COMMS / ARRIVAL',labels:['Approach','Tower','Cabin','Operations'],action:'Tune' },
 { id:'exit-check',name:'Check exits and aisle',area:'Forward cabin',hint:'Check the cabin exit indicators and clear paths in order.',x:-2.8,z:-8.7,color:'#dba0ad',role:'Cabin Crew',stage:'departure',panel:'checklist',code:'CABIN / EXITS',labels:['Exit indicator','Aisle clear','Floor lighting','Door area clear'],action:'Inspect' },
 { id:'pressure-check',name:'Cabin pressure check',area:'Aft galley',hint:'Balance the simulated pressure console readings.',x:2.6,z:9.4,color:'#c1b0e5',role:'Engineer',stage:'service',panel:'dial',code:'AIR / PRESSURE',labels:['Cabin reading','Air supply','Flow balance','Controller test'],action:'Balance' },
 { id:'emergency-kit',name:'Inventory emergency equipment',area:'Maintenance bay',hint:'Place the equipment cards into the manifest slots.',x:2.6,z:14,color:'#c1b0e5',role:'Engineer',stage:'turbulence',panel:'match',code:'EQUIP / INVENTORY',labels:['First-aid kit','Flashlight','Oxygen kit','Fire extinguisher'],action:'Place' },
 { id:'manifest',name:'Reconcile security manifest',area:'Forward cabin',hint:'Match the four security records to their manifest slots.',x:2.8,z:-8.7,color:'#b9cbd8',role:'Air Marshal',stage:'departure',panel:'match',code:'SEC / MANIFEST',labels:['Crew badges','Boarding count','Seating record','Security report'],action:'Match' },
 { id:'flightdeck-seal',name:'Inspect flight deck access',area:'Forward cabin',hint:'Check the access seals and log indicators. This does not reveal allegiance.',x:.9,z:-9.35,color:'#b9cbd8',role:'Air Marshal',stage:'service',panel:'checklist',code:'SEC / ACCESS',labels:['Access seal','Latch indicator','Crew credential','Access log'],action:'Inspect' },
 { id:'security-sweep',name:'Complete security sweep',area:'Aft lounge',hint:'Verify the security checkpoints before arrival.',x:-2.55,z:16.8,color:'#b9cbd8',role:'Air Marshal',stage:'approach',panel:'checklist',code:'SEC / ARRIVAL',labels:['Aft access','Galley seal','Equipment seal','Incident log'],action:'Inspect' },
 { id:'baggage-stow',name:'Stow carry-on luggage',area:'Passenger cabin',hint:'Pack loose belongings into the shown storage compartments.',x:-1.85,z:2.75,color:'#d3bc8d',role:'Passenger',stage:'departure',panel:'supplies',code:'SEAT / BAGGAGE',labels:['Carry-on bag','Jacket','Headphones','Small pouch'],action:'Stow' },
 { id:'safety-card',name:'Review seat safety card',area:'Passenger cabin',hint:'Match the safety card symbols to the shown spaces.',x:1.85,z:5.75,color:'#d3bc8d',role:'Passenger',stage:'service',panel:'match',code:'SEAT / SAFETY',labels:['Seatbelt','Oxygen mask','Life vest','Nearest exit'],action:'Match' },
 { id:'seat-preparation',name:'Prepare seat for landing',area:'Passenger cabin',hint:'Secure your seat area in the requested order.',x:-1.85,z:-.25,color:'#d3bc8d',role:'Passenger',stage:'approach',panel:'checklist',code:'SEAT / ARRIVAL',labels:['Tray table','Seat back','Loose items','Window shade'],action:'Secure' },
] as const satisfies readonly Station[];
export type TaskId = typeof TASKS[number]['id'];
export const EQUIPMENT_IDS = ['checklist','navigation','seatbelts','meals','electrical'] as const;
export type EquipmentId = typeof EQUIPMENT_IDS[number];
