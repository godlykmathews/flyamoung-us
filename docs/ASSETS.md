# Aircraft art and asset pipeline

The walkable interior, task/service props and current animated airline cast are authored in Blender and exported as local GLBs. Editable sources live in `models/blender/`; `client/src/scene/BlenderInterior.tsx` loads the exported art without changing its metre-scale world coordinates. The exterior presentation uses the project owner's supplied Boeing 737 MAX 8 GLB. Original Three.js geometry remains a loading/error fallback, so asset loading does not remove the walking controls.

## Boarding, flight operations and private tools — 11 October 2026

`scripts/blender/build_journey_assets.py` creates eleven original CC0 models: airport terminal, gate desk, open-window jetbridge, boarding scanner, crew documents, passport, suitcase, runway lights, sealed sabotage case, rounded knife and coiled rope. Runtime GLBs live in `client/public/models/journey/`; editable source, hashes, dimensions and inspection results live in `models/blender/journey-*`. The complete kit is **1,099,052 bytes / 36,024 triangles** with embedded PBR materials and no external textures. See the [journey asset guide](../models/blender/journey-assets.md) for pivots and hand mounts.

The terminal uses the existing animated cast for boarding travelers, seated passengers and the dispatch attendant. All human players now use the same ordinary traveler model independently of public role or private allegiance. Equipped tools follow the existing hand animation; the private inventory is never attached to a concealed character. Tool-specific attack and restraint clips remain future animation work.

The supplied Boeing's verified gear meshes are visible during ground operations and when the pilot lowers the gear. Cruise hides them. `JourneyScene.tsx` presents authoritative takeoff/landing telemetry and a shared sea-crash ending with a procedural ocean and non-graphic impact splash. This replaces the earlier above-cloud descent for the new operations flow; it does not add physical aircraft breakup or hydrodynamics.

Actual Blender Cycles previews: [boarding](previews/journey-boarding.png), [props](previews/journey-props.png), [airport](previews/journey-airport.png). All eleven GLBs passed structural inspection without errors or warnings. These are asset renders and structural checks; the new browser scene was not visually tested because the user chose automated verification after the browser permission block persisted.

## Incident presentation and passenger activities — 11 October 2026

The current incident pass reuses the existing Blender cabin, sixteen-clip cast, service props and `models/safety/oxygen-mask.glb`; it does not add a new character export or claim new authored animation clips. Remote working actions use `Gesture`, reading reuses `Serve`, resting uses `Idle`, incapacitation uses the existing non-graphic unresponsive pose, and the fixed pilot uses the seated unresponsive pose while awaiting aid. A fitted oxygen mask is mounted at face height on the character. Dedicated treatment, restraint and magazine-holding animation remains future art work.

`client/src/scene/IncidentEffects.tsx` adds **twenty instanced masks**, one per passenger seat, with shared GLB geometry/materials, instanced hoses and opening overhead panels. They deploy for an actual pressure incident, independently of ordinary turbulence. Additional local Three.js assets provide illuminated aisle paths, a labelled pressure console, soft electrical smoke with restrained sparks, and muted storm lighting. The horizon responds subtly to authoritative roll/pitch while the metre-scale interior and collision world remain level. Reduced-motion settings suppress incidental sway, flashes and camera shake. No external asset download or paid generator is involved in this pass.

`client/src/scene/EmergencyDescent.tsx` reuses the attributed Boeing exterior and procedural Earth/cloud environment for a **nine-second** integrity-failure presentation, with a small instanced engine trail and smooth tracking camera. It ends above the Earth/cloud deck, has no ground-impact sequence, and can be skipped to the debrief. This is a rendered outcome presentation, not flight dynamics, aerodynamic damage, aircraft breakup or crash physics.

The flight magazine and On board interface are original local UI artwork. Existing recordings remain unchanged; generated weather rumble, pressure hiss and warning tones provide quiet defaults until optional recordings are supplied. Exact supported audio filenames and requested sounds are in [voice/README.md](../voice/README.md). New effect verification is recorded at the top of [TESTING.md](TESTING.md); earlier Blender inspection receipts still describe the unchanged source assets.

## Safety demonstration and installed audio — 11 October 2026

The current runtime cast has **sixteen clips on each of eight characters**. `scripts/blender/add_safety_demonstrations.py` augments the original twelve-clip cast with `SafetySeatbelt`, `SafetyOxygen`, `SafetyLifeVest` and `SafetyExits`; the editable augmented source is `models/blender/animated-crew-safety.blend`. These are original keyframed movements on the existing compatible rigs. The earlier twelve-clip budgets below describe the preserved base milestone; current hashes, sizes and clip lists are in `models/blender/safety-demonstration-manifest.json`.

Five new original GLBs live in `client/public/models/safety/`: `belt-left.glb`, `belt-right.glb`, `oxygen-mask.glb`, `life-vest-folded.glb` and `life-vest.glb`. Together they contain 9,764 triangles and 268,560 bytes, with embedded materials and no external textures. The two belt halves follow the palms, the mask moves from the hand to the face, and the folded vest becomes the worn vest during its step. Exit guidance uses the character's pointing animation. Prop mounts and preview poses are recorded in the same manifest; the Blender contact sheet is `docs/previews/safety-demonstrations.png`.

All four authored safety clips are four seconds long. Runtime playback maps their normalized time onto the server's **14.5 / 4 / 4 / 4 second** steps, so the first step accommodates the full 13.632-second seatbelt explanation. This produces a 26.5-second public performance after the player solves the front-cabin card arrangement. The character's ordinary public role determines its appearance, independently of hidden allegiance.

`models/blender/safety-demonstration-inspection.json` records local structural inspection of the eight characters, sidearm and five safety props, plus 33 animation samples per clip for all sixteen clips on each character. These checks report finite deformation and no structural errors; the expected static-bound notices on skinned meshes remain. This is project validation, not Khronos certification. Browser presentation and audio verification are tracked separately in [TESTING.md](TESTING.md).

The user supplied `voice/welcome.m4a`, `voice/seatbelt.mp3` and `voice/service chime.mp3`. The preparation script preserves their bytes and copies them into the public audio folder. These are installed recordings, superseding the earlier empty-audio milestone; they are not claimed as original project sound assets. Their measured durations, event mapping, metadata and unresolved source/license details are documented in [voice/README.md](../voice/README.md). Engine ambience and fallback chimes remain generated locally.

## Supplied exterior aircraft

`models/boeing_737_max_8_-_flydubai.glb` is preserved unchanged and copied to `client/public/models/boeing-737.glb` for Vite's public assets. Its embedded metadata attributes **Boeing 737 MAX 8 - Flydubai** to [SAIMON584Models](https://sketchfab.com/SAIMON584models), from [this Sketchfab model](https://sketchfab.com/3d-models/boeing-737-max-8-flydubai-3320025245764f5faf7720b81b16d939), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The shipped attribution is available at `/models/ATTRIBUTION.txt` and must travel with the asset.

Local byte and geometry inspection found:

- glTF 2.0 binary, 1,622,456 bytes; SHA-256 `00ad6992b8465ec8b3e2aa5cc41ceacab41977db86a6b2adad6d7ca6accfaf7d`.
- 32 meshes, 12 materials, 14,972 triangles and 14,875 vertex records; no embedded animation tracks.
- Four embedded 2048 × 2048 PNG textures. There are no external texture URLs or Draco/Meshopt requirements. `KHR_materials_specular` is supported by the installed Three.js loader.
- Original world-space bounds: minimum `[-15.524745, -0.010000, -18.542208]`, maximum `[15.751094, 10.968793, 15.752449]`; dimensions `31.275839 × 10.978793 × 34.294657` source units. The source is Y-up with its nose pointing +Z.

`client/src/scene/FlightModel.tsx` clones the cached scene hierarchy, centers it, rotates it 180° around Y and uniformly scales its length to 24 game metres. The resulting dimensions are approximately `21.887 × 7.683 × 24`, with the nose pointing -Z. This is a presentation transform, not a claim about the model's real-world dimensions. Flight animation belongs to the parent scene; it does not modify the source GLB or couple the walkable interior to the exterior model. Materials and textures remain shared across clones. Loading failures display the existing procedural aircraft so the launch can continue.

The source texture budget is retained for this single hero aircraft. Any later texture downsampling or compression should create a separate derivative, retain the attribution and verify the result in the browser. The Game Development Studio `game-dev` executable was unavailable on this host; the checks above came from the GLB's bytes and transformed mesh vertices using local Node.js and Three.js, not from a CLI validation receipt or Blender normalization.

## What is built now

- A walkable 31.45-metre-long, 7.4-metre-wide cabin with a curved shell, recessed windows, overhead bins with latches, passenger reading lights and vents, exit doors, and a flight-deck doorway.
- Twenty shaped passenger seats have woven navy upholstery, headrests, armrests, seatback trays, pockets, piping and metal supports. The seat banks are centred at X=±1.9/±2.95, leaving a much wider central aisle. A separate fixed pilot chair sits at `[-1.65, 0, -11.05]` and the flight-deck doorway is 1.5m wide. Seat cushions are mounted at Y=0.57 for seated characters. Blender retains editable parts; static exported geometry is combined by material to keep draw calls low.
- A four-metre aft vestibule adds a detailed catering trolley, storage, lavatory facade, luggage, folded crew jumpseat and extinguisher. The trolley interaction is at X=−2.55, Z=15.5; side furniture respects explicit shared colliders.
- Five separate GLB task models: crew clipboard, FMS with keypad, seatbelt hardware, galley service kit and breaker panel. Physical bevels, PBR metal/plastic materials and embedded printed textures add detail. The HTML interface optionally loads Google Fonts, with system-font fallbacks.
- The supplied exterior model appears in the lobby and launch flight animation. A procedural exterior with a lathed fuselage, extruded swept wings, teal vertical stabilizer, engines and cabin windows provides the fallback. Neither is the interior collision mesh.
- All materials are simple, physically based materials with restrained metal and fabric values. The viewport owns lighting, camera, atmosphere and tone mapping.

The art uses a light commercial-airline palette and recognizable manufactured parts, with simplified geometry for browser play. The cockpit instruments are decorative; the prototype does not simulate real flight systems.

## Rebuild the Blender assets

Blender 5.2.2 LTS was used for the checked-in sources and GLBs. On this Mac it is installed at `/Applications/Blender.app/Contents/MacOS/Blender`. After putting that directory on `PATH`, run from the project root:

```sh
blender --background --factory-startup --python scripts/blender/build_cabin.py -- --render
blender --background --factory-startup --python scripts/blender/build_equipment.py
blender --background --factory-startup --python scripts/blender/build_animated_crew.py
blender --background --python scripts/blender/add_safety_demonstrations.py
blender --background --factory-startup --python scripts/blender/build_service_items.py
node scripts/inspect-glb.mjs client/public/models/interior/*.glb client/public/models/animated/*.glb client/public/models/service/*.glb client/public/models/safety/*.glb
npm run build
```

The scripts preserve the source objects in editable `.blend` files and export separate runtime collections. Cabin textures and equipment labels are embedded in the GLBs. The cabin manifest lives beside its GLB; the equipment manifest lives in `models/blender/`. They record source paths, authorship, mesh budgets and hashes. No external model-generation service or purchased art is needed for these assets. Blender needs normal macOS graphics access even in background mode on this host. The equipment atlas is checked in; see `models/blender/EQUIPMENT.md` for regenerating its artwork with Python/Pillow.

The current extended cabin is 3,933,980 bytes / 143,030 triangles / 15 mesh primitives, with two embedded 512px textures. The six equipment GLBs total 3,200,164 bytes / 54,148 triangles. Each equipment file embeds a 2048px label atlas. All seven exports pass the local structural inspector with finite metre-scale bounds, embedded resources and no required decoder extensions. This is a project inspection, not a Khronos glTF validator certification.

`cabin_emissive` is dimmed during blackout while exit signage remains lit. `status_lamp` changes when a task completes; the four circuit pivot groups and `Buckle_Tongue` remain separate for physical completion feedback. The loader clones stateful materials and object transforms without mutating the shared GLTF cache. Geometry, textures, collisions, and server task rules remain independent. Soft reflection lighting is generated locally with Three.js `RoomEnvironment`; no remote HDR file is required.

## How production assets can replace the prototype

Model the aircraft as a modular kit in Blender: two-metre cabin shell sections, window sections, seats, bin sections, bulkheads, doors, cockpit consoles, galley carts and electrical cabinets. Start from the procedural scene's dimensions so artwork can improve without moving gameplay anchors. Use the existing original art as the visual reference, or create reference images before modeling. AI-generated concept images may help art direction; a single generated image is not a usable, collision-ready 3D aircraft.

Export cleaned meshes as glTF binary (`.glb`), with applied transforms, authored UVs, sensible object origins, outward normals and named materials. Keep texture sets small and share material atlases among repeated props. Verify each model at normal first-person eye height and in the darkest playable lighting. For commissioned, generated or purchased replacements, record authorship, source, license and tool/provider terms before bundling them.

Recommended conventions:

- One unit equals one metre; +Y is up; the aircraft nose points toward -Z. Cabin floor is Y=0, eye height is 1.68, ceiling is 3.2 and side walls are X=±3.7. Seat centres are X=±1.9/±2.95 at rows Z=−7, −4, −1, 2 and 5. The galley and maintenance fixtures moved outward by 0.6m; cockpit consoles remain at X=±1.65.
- Reusable asset pivots sit on the floor at the item's local centre. Keep each imported asset in a wrapper that converts export orientation once, if needed.
- Put exported interior art in `client/public/models/interior/`. Keep editable Blender sources in `models/blender/`.
- Preserve task positions and row spacing from `shared/world.ts`. Treat task IDs as gameplay identity, never derive them from mesh names or click targets.
- Author simplified collision separately. `shared/world.ts` is currently the shared movement authority; decorative meshes never decide whether a player can walk somewhere. Update and test collision explicitly when changing the layout.
- Keep seats and repeated cabin sections instanced where practical. Merge static parts that share a material, but retain independent objects needed for animation or interaction.
- Inspect the exported GLB in the actual browser build, check network sizes and frame time, and add distance-based detail only when measured needs justify it. Texture compression and mesh compression require compatible decoders shipped with the app.

## Hybrid flight architecture

Keep the stationary interior's local coordinates independent of an eventual aircraft world transform. Flight simulation should update a vehicle pose and flight-system state; exterior visuals, window scenery and instruments can consume that state. First-person crew movement remains local to the aircraft. An autopilot and manual controls can then write into the same flight-control interface without coupling meshes to simulation rules.

The present prototype provides the art and interior layout foundation. Animated doors, mechanically animated cockpit yokes, real gauges and exterior damage remain future asset work. The current cockpit panel provides a fictional, server-owned balance game independently of the decorative cockpit meshes. Character pose and clip generation is a separate Blender pipeline from the stationary cabin.

## Cruise atmosphere and crew update

The Boeing is presented with nine inspected extended gear/tire/axle/open-door nodes hidden on each runtime clone. Its source and cached scene remain unchanged. This is a gear-up cruise pose, not an authored retraction animation. Aircraft self-shadowing, horizon haze and a steady camera replace the earlier orbiting presentation.

`CloudVolumes.tsx` arranges 240 soft shaded puffs in 24 spatial clusters and sorts them for transparency. A 39 KB original density texture is generated by `scripts/generate-cloud-texture.mjs`; no stock imagery or external service is used. These are textured cloud volumes built for the browser, not a physical atmospheric simulation.

`FlightEnvironment.tsx` adds a sky/horizon shader and scrolling procedural terrain with coastlines, fields, ridges and water. The same environment is visible through transparent cabin windows and the open cockpit windscreen, and appears below the aircraft during the eight-second live 3D intro. It uses no downloaded satellite imagery or remote service. Terrain scale/altitude are presentation coordinates, deliberately separate from cabin collision and simplified flight telemetry. This is not geographic terrain or a prerecorded video.

The supplied textured **Indian Man In Kurta (2)** by Pixel_Monster / ar.jethin was used in the earlier prototype. It is preserved but is no longer the active player model. The unchanged runtime GLB is 14,523,112 bytes, with 64,662 triangles, 13 skinned meshes, one skeleton, 18 embedded 512/1024px textures and no animation clips. Its supplied metadata records a Sketchfab Standard license; credits and source are in `client/public/models/CHARACTER_ATTRIBUTION.txt`. That earlier renderer used an independent skeleton, a 1.78m grounded height and generated walking/carry poses. The current renderer uses the original animated cast below instead of scan deformation. Older scan-derived pilot, passengers and attendants remain preserved separately.

### Original animated airline cast — base milestone

The original cast is built **from scratch** by `scripts/blender/build_animated_crew.py`, with editable base source `models/blender/animated-crew.blend` and runtime files in `client/public/models/animated/`. The safety augmentation described above must run afterward to reproduce the current sixteen-clip exports. No geometry or textures from the supplied scans are used in these characters. They use stylized, articulated anatomy, authored uniform/skin/hair vertex colours and independent runtime skeletons. The user does not need to supply animation.

Eight character appearances share a compatible rig: navy AI attendant, burgundy player attendant, pilot, Air Marshal, engineer and three passengers. The base milestone has one skinned mesh, one vertex-colour material, no image textures and twelve clips: `Idle`, `Walk`, `Carry`, `Serve`, `Sit`, `Seated`, `Stand`, `Gesture`, `Brace`, `Dead`, `DeadStanding` and `Weapon`. The safety extension above adds four clips to every runtime character without changing its mesh budget. A separate original sidearm appears only while the server's public `weaponDrawn` state is true. Allegiance never selects a special model or material.

| Original asset | Bytes | Triangles |
| --- | ---: | ---: |
| AI attendant | 987,056 | 17,814 |
| Player attendant | 987,080 | 17,814 |
| Pilot | 965,920 | 17,256 |
| Marshal | 875,828 | 15,468 |
| Engineer | 915,284 | 16,208 |
| Passenger A | 910,564 | 16,296 |
| Passenger B | 942,984 | 17,026 |
| Passenger C | 926,100 | 16,484 |
| Sidearm prop | 29,128 | 780 |

The export contract is metres, +Y up, −Z forward, grounded at Y=0, approximately 1.77m standing height and a seat cushion at Y=0.57. `Sit`/`Stand` last 1.25 seconds; `DeadStanding` lasts 1.625 seconds; ordinary loops are 1.25 or 2.042 seconds. Sit, stand and unresponsive transitions are played once and clamped. `Carry` includes walking; `Serve` plants the feet. Bracing and `Dead` are seated poses. Character rendering blends clips and smoothly interpolates authoritative positions/yaw. Player duty interactions use `Gesture`; a weapon uses `Weapon` with a separate prop attached near the right palm.

Three.js sanitizes `Hand.L` / `Hand.R` bone names to `HandL` / `HandR`; the renderer accepts both names. Tray placement follows both hands; the sidearm follows the right hand. Exact hashes, clip durations and export budgets are recorded in `animated-crew-manifest.json`. `animated-crew-inspection.json` records structural checks and 33 deformation samples per clip. Reference renders include `docs/previews/original-airline-cast.png` and pose/seat-fit images beside it. These are original stylized characters, not photorealistic or motion-captured humans.

The previous scan-processing scripts (`build_characters.py`, `build_passengers.py`, `build_pilot.py`) and derivative `.blend` scenes remain available to reproduce the earlier milestone; they do not build the current cast.

### Preserved earlier character derivatives

The earlier supplied source GLBs are preserved in `models/`. These scan derivatives are retained for provenance and comparison; they are not the active cast. Their embedded metadata records the following attribution; the project does not claim authorship of these source people. Blender derivatives change pose, scale, materials and mesh density, and may add locally authored movement. Their preserved derivative files live in `client/public/models/characters/`, separate from the original source bytes.

| Source model | Creator recorded in GLB | Recorded license |
| --- | --- | --- |
| [Flight Attendant Pin-Up](https://sketchfab.com/3d-models/flight-attendant-pin-up-a8e03b1a070a41aab1267d9b71f984e5) (`flight_attendant_pin-up.glb`) | Ded Makar | CC BY 4.0 |
| [Pilot In Uniform](https://sketchfab.com/3d-models/pilot-in-uniform-2860e37246324dc1a6444054c9b3abc4) (`pilot_in_uniform.glb`) | Alebor64 | CC BY 4.0 |
| [Confident Professional](https://sketchfab.com/3d-models/confident-professional-4fc23a052ff04dd293142388ea89944a) (`confident_professional.glb`) | XRProfXR | CC BY 4.0 |
| [Casual Portrait of a Mature Man](https://sketchfab.com/3d-models/casual-portrait-of-a-mature-man-b5fb38849c2640628ecf17ecac244b53) (`casual_portrait_of_a_mature_man.glb`) | restore50 | CC BY 4.0 |
| [fashionable skoof](https://sketchfab.com/3d-models/fashionable-skoof-825e8250c7794e71b52179e6d24399c7) (`fashionable_skoof.glb`) | DENNISS75 | CC BY 4.0 |

The earlier runtime contract was +Y up, forward −Z and feet at Y=0. Seated derivatives use a hip/seat mount at Y=0.57 and local Z=0, with a 1.7m attendant. The earlier renderer accepted `Idle`, `Walk`, `Carry` and `Serve` clips; these are locally authored derivatives where present, not animations supplied in the static scans. Final counts and hashes are recorded in `models/blender/character-manifest.json`, `cabin-passengers.manifest.json` and `cabin-characters-inspection.json`. Full shipped character attribution remains in `client/public/models/CHARACTER_ATTRIBUTION.txt`.

| Earlier derivative | Bytes | Triangles | Clips |
| --- | ---: | ---: | --- |
| Navy AI attendant | 930,376 | 26,000 | Idle, Walk, Carry, Serve |
| Burgundy player attendant | 930,408 | 26,000 | Idle, Walk, Carry, Serve |
| Seated pilot | 811,976 | 31,363 | Static seated pose |
| Passenger A: mature man | 1,448,960 | 34,999 | Static seated pose |
| Passenger B: professional woman | 2,950,120 | 59,993 | Static seated pose |
| Passenger C: hat and scarf | 1,536,112 | 34,998 | Static seated pose |

Each attendant and passenger uses one mesh primitive; the detailed pilot uses 15. The attendant clips last 2.042 seconds and share a local Blender-authored rig. The source attendant is a posed scan with crossed ankles and one hand joined to the jacket: the derivative keeps that arm on the hip and uses the free hand for the service tray. Its restrained gait is a prototype animation. A neutral A/T-pose character would allow a more natural full stride; no user-authored animation is required.

The pilot and attendants use authored navy, white, gold and burgundy colours; passenger source textures are preserved and embedded. These six preserved scan derivatives total 8,607,952 bytes. Editable scenes are `cabin-characters.blend`, `cabin-passengers.blend` and `cabin-pilot.blend` in `models/blender/`. All six pass the local GLB structural inspector without errors. The attendants carry the expected notice that static bounds do not evaluate animation; their four clips were also sampled with the Three.js animation mixer for finite skinned bounds. Blender previews are in `docs/previews/`.

`CabinNpcs.tsx` renders server-owned cabin occupants, smooths their positions/yaw and uses camera-facing sprite labels. Comfortable passengers have only nearby seat tags; active requests show compact item cards. Carrying items and unresponsive poses are visual state, while requests, service, deaths and task rules remain server-owned.

[The model request](MODEL_REQUEST.md) describes useful future sources. Static textured GLBs are welcome; the user does not need to produce animation clips. Clean, pre-rigged characters and authored clips are optional upgrades.

### Handheld cabin service kit

`build_service_items.py` authors four original handheld props in Blender: a lined aluminium tray and porcelain coffee cup/saucer, a fluted water tumbler, a meal dish with food and cutlery, and a folded blanket with stitching. They replace the temporary primitive service shapes. Editable source is `models/blender/service-items.blend`; runtime exports are in `client/public/models/service/`. They use metres with a tray-centre origin. The current cast attaches the tray to the midpoint between the animated hand bones, kept level with approximately 0.008m vertical clearance. Nominal placement is `[0, 1.04, -0.34]`; the earlier scan models used fixed mounts.

| Item | Bytes | Triangles |
| --- | ---: | ---: |
| Coffee | 130,436 | 3,360 |
| Water | 105,444 | 2,324 |
| Meal | 243,464 | 6,004 |
| Blanket | 57,672 | 1,284 |

All four have embedded PBR materials, no external resources or decoder requirements, and pass the local GLB inspector. The studio preview is `docs/previews/service-items.png`. Rebuild with `blender --background --factory-startup --python scripts/blender/build_service_items.py`.
