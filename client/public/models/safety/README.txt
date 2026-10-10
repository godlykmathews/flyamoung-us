FLIGHT 404 — original safety demonstration equipment

Authored locally in Blender 5.2.2 from original procedural geometry.
No downloaded meshes, textures, or paid generation.
Source: scripts/blender/add_safety_demonstrations.py
Editable cast, props and preview: models/blender/animated-crew-safety.blend
Manifest / hashes: models/blender/safety-demonstration-manifest.json
Validation: models/blender/safety-demonstration-inspection.json

All props are metres, glTF +Y up / -Z forward. Preserve their root yaw;
do not inherit the animated hand's rotation. They have no external textures.

belt-left.glb and belt-right.glb:
  World palm = hand.getWorldPosition() + (0,.04,0) rotated by the hand world quaternion.
  Then add character-forward .035m. Use HandL and HandR after Three name sanitization.
  Clip SafetySeatbelt: lift halves 0–.65s, present separately .65–1.35s,
  join 1.35–2.25s, hold fastened 2.25–4s. Retiming for narration is supported.

oxygen-mask.glb:
  Origin at cup center. During .75–1.95s move from right palm to root-local
  face [0,1.605,-.127]; hold there from1.95–4s. Clip SafetyOxygen.

life-vest-folded.glb:
  During .35–1.1s place halfway between palms, plus character-forward .025m.
  Fade/scale away during1.1–1.6s as deployed model appears. Clip SafetyLifeVest.

life-vest.glb:
  Sternum pivot root-local [0,1.38,-.103], character yaw, show from1.1–1.6s onward.

SafetyExits needs no prop. All four clips are exactly4 seconds on all8 rigs.
Use LoopOnce + clampWhenFinished and sample using authoritative timeline.

Regenerate cast base if needed with build_animated_crew.py, then run
add_safety_demonstrations.py. The augmentation preserves all12 original clips.
