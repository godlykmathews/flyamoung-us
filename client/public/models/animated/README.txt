FLIGHT 404 — original animated airline cast

These GLBs were authored from scratch with Blender mesh geometry, vertex colours,
a humanoid deformation skeleton and keyed animation clips. They do not contain
geometry or textures derived from the separately supplied character scans.

Editable base source: models/blender/animated-crew.blend
Current augmented source: models/blender/animated-crew-safety.blend
Rebuild in order: scripts/blender/build_animated_crew.py, then
scripts/blender/add_safety_demonstrations.py
Manifest: models/blender/animated-crew-manifest.json
Current safety/export manifest: models/blender/safety-demonstration-manifest.json
Current animation validation: models/blender/safety-demonstration-inspection.json
Base milestone validation: models/blender/animated-crew-inspection.json

Coordinates: metres, glTF +Y up, -Z forward, ground Y = 0.
Seated characters are authored for a cushion top at Y = 0.57 m.
Each character uses one skinned mesh, one vertex-colour material, no image textures.

Files: attendant, attendant-player, pilot, marshal, engineer,
passenger-a, passenger-b, passenger-c; plus the separate fictional sidearm prop.

Sixteen clips on all eight characters: Idle, Walk, Carry, Serve, Sit, Seated,
Stand, Gesture, Brace, Dead, DeadStanding, Weapon, SafetySeatbelt,
SafetyOxygen, SafetyLifeVest and SafetyExits.
Sit / Stand / DeadStanding should play once with their final frame clamped.
Carry includes walking. Serve has stationary feet. Brace and Dead are seated.
Public uniforms correspond to crew jobs; there is no special impostor character.
The sidearm is a separate attachment and is only shown by runtime weapon state.

The four safety clips are each authored at four seconds. Runtime maps their
timeline onto 14.5 / 4 / 4 / 4 seconds to fit the supplied seatbelt narration.
Use the server's demonstration state for synchronized playback and meeting
pauses. The five separately authored safety props are belt-left, belt-right,
oxygen-mask, life-vest-folded and life-vest in /models/safety/. Their README
records the attachment contract; SafetyExits needs no equipment prop.

Three GLTFLoader names the hand bones HandL and HandR (GLB node names Hand.L / Hand.R).
The service tray is held level at the midpoint between the hands, with approximately
0.008 m upward clearance. In the Serve pose the midpoint is around [0, 1.032, -0.34]
and moves slightly forward during presentation. The Weapon pose puts the right
hand near [0.045, 1.22, -0.44]; place the prop slightly ahead of the palm.
