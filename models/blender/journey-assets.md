# FLIGHT 404 journey assets

Eleven original Blender-authored models for the boarding-to-arrival game flow. All geometry, lettering and materials were created by `scripts/blender/build_journey_assets.py`. No downloaded geometry, textures, paid generation or real brand marks are used. These original assets are dedicated under **CC0-1.0**.

The palette uses porcelain white, ivory, navy, ocean blue, brushed aluminium and amber. Small equipment has bevels and weighted normals; lighting and architectural glazing use ordinary glTF PBR materials. The jetbridge has open window bays so the runtime airport remains visible without transparent-material sorting costs.

## Runtime contract

Files live under `client/public/models/journey/` and load from `/models/journey/<name>.glb`. Exports use metres, **+Y up**, and **+Z facing front**. The origin is at the base centre unless specified below. Each GLB has one combined mesh with a small number of material primitives. No external files, images, skins or animations are required.

| Model | Dimensions W × H × D, metres | Placement |
|---|---|---|
| `gate-desk.glb` | 3.72 × 2.88 × 1.00 | Floor origin; counter surface Y=1.175; front +Z |
| `jetbridge.glb` | 3.35 × 3.02 × 8.10 | Passage along Z; entrances at ±4; walking floor Y≈0.03; structural floor extends to Y=-0.13 |
| `boarding-scanner.glb` | 0.43 × 1.20 × 0.40 | Floor origin; scanning surface Y≈1.19 |
| `crew-documents.glb` | 0.30 × 0.047 × 0.40 | Flat on XZ; readable from +Z; origin at table surface |
| `passport.glb` | 0.11 × 0.023 × 0.155 | Flat on XZ; readable from +Z; origin at table surface |
| `suitcase.glb` | 0.408 × 0.752 × 0.267 | Wheeled base; raised grip; front +Z |
| `airport-terminal.glb` | 29.20 × 6.72 × 8.725 | Floor origin; doors face +Z |
| `runway-lights.glb` | 18.52 × 0.175 × 0.52 | Origin on runway centreline; two edge lights at X=-9 and +9 |
| `sabotage-case.glb` | 0.425 × 0.311 × 0.254 | Base origin; handgrip centre Y≈0.308 |
| `knife.glb` | 0.071 × 0.320 × 0.034 | Grip base at origin; grip centre Y≈0.06; blade points +Y |
| `rope.glb` | 0.226 × 0.022 × 0.184 | Coil lies in XZ, centred Y≈0.019 |

For a knife pointed along game -Z, rotate around X by `-Math.PI / 2` and mount the grip centre at the hand. For a hanging rope, rotate the flat coil around X by `Math.PI / 2` and lower the model by about 0.10 m relative to the hand. A case held by its handle uses a Y offset of about -0.308 m. These are visual game props: the case is sealed, the knife has rounded edges, and neither contains a functional mechanism.

## Reproduce and inspect

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/blender/build_journey_assets.py

node scripts/inspect-glb.mjs client/public/models/journey/*.glb
```

Blender 5.2.2 LTS was used. The script retains editable objects in named collections in `journey-assets.blend`; the source file opens with the terminal studio view. Some source collections are scaled and moved for the gallery, while the GLBs export before those gallery transforms. Rerunning the script resets and reproduces every runtime model.

`journey-manifest.json` records per-model SHA-256 digests, dimensions, triangles, size, original provenance and source/script digests. `journey-inspection.json` records the project inspector's structural checks. Total runtime transfer is approximately **1.10 MB** for **36,024 triangles**, within the 3 MB target.

Three actual Cycles renders were inspected for silhouette, material readability, signage and placement:

- `docs/previews/journey-boarding.png`
- `docs/previews/journey-props.png`
- `docs/previews/journey-airport.png`

All eleven GLBs pass the project's static inspector with no errors or warnings, finite metre-scale bounds and no external resources. These checks are separate from the browser renderer and gameplay tests. The `game-dev` CLI was not present on PATH, so no CLI canonical-package verification is claimed.
