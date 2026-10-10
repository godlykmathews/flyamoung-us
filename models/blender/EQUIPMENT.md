# FLIGHT 404 equipment source

These original models were authored and rendered with Blender 5.2.2 for FLIGHT 404. The source contains separate editable scenes for installed fixtures, each of the five tasks, and a lit equipment gallery. The `EXPORT` scenes are generated copies whose static meshes are joined by material; the named source parts remain editable.

The kit includes two flight-deck instrument consoles and yokes, a fitted galley with trolley fronts and an open worktop, a maintenance cabinet, clipboard, flight-management unit, belt inspection pad, meal tray and coffee machine, and a circuit panel. Edge radii, layered components, fasteners, woven belt detail, inset displays, cutlery, dishware and metal finishes are modeled or printed in the embedded texture atlas. They are game props, not training-grade aircraft controls.

## Rebuild

Run from the repository root with Python and Pillow, then Blender:

```sh
python3 scripts/blender/make_equipment_atlas.py
blender --background --factory-startup --python scripts/blender/build_equipment.py
```

`make_equipment_atlas.py` currently uses macOS Arial font paths. Change the two font paths to installed equivalents on other systems. On this workspace, Pillow is available in the Codex bundled Python runtime; no additional package was installed. Pass `-- --no-render` after the Blender command to regenerate only the source and exports. Blender needs normal macOS hardware access even for background work; a filesystem-only sandbox can crash during Metal device detection.

Outputs:

- `flight-equipment.blend`: editable Blender source, with the equipment gallery active.
- `equipment-atlas.png` / `.json`: original, locally painted 2048px texture atlas and UV regions.
- `equipment-manifest.json`: file hashes, exact vertex bounds, triangle counts and embedded-resource checks.
- `../../client/public/models/interior/{flight-equipment,checklist,navigation,seatbelts,meals,electrical}.glb`: browser assets.
- `../../docs/previews/blender-equipment.png`: Cycles CPU render of the source props.

## Runtime contract

GLBs use metres, +Y up and +Z toward the viewer. The Blender helpers transform game `(x,y,z)` into Blender `(x,-z,y)`; standard glTF export restores the game axes. `flight-equipment.glb` already contains world-space placements. The five task GLBs use local origins for the existing runtime mounts.

The current cabin is 7.4m wide, with side walls at X=±3.7. Both passenger seat banks moved outward by 0.6m (centres X=±1.9/±2.95). The galley assembly moved from X=−2.14 to −2.74; the maintenance assembly moved from X=1.857 to 2.457. Their local geometry is unchanged. The two cockpit consoles stay at X=±1.65. A 1.5m doorway and a fixed pilot chair at `[-1.65, 0, -11.05]` belong to `aircraft-cabin.blend`, not this equipment kit.

| Asset | Game mount | Yaw |
| --- | --- | --- |
| checklist | `[-1.25, 1.63, -11.93]` | 0 |
| navigation | `[1.25, 1.65, -11.93]` | 0 |
| seatbelts | `[1.9, 1.16, -3.38]` | 0 |
| meals | `[-2.74, 1.175, 9.4]` | +π/2 |
| electrical | `[2.457, 1.41, 12.3]` | −π/2 |

Each task has a `status_lamp` material. Clone it for per-instance state. Circuit switch parents are named `Switch_cabin`, `Switch_galley`, `Switch_seats`, and `Switch_comms` (Blender may append numeric suffixes in exported copies); their local X axis is the operating pivot. `Buckle_Tongue` translates along local X; moving it −0.045m visibly latches the belt. These moving nodes are excluded from static mesh merging. The game remains authoritative for task completion; the GLBs carry no flight simulation or network state.

Animate only the named non-mesh switch pivots. Three.js sanitizes spaces to underscores, so a child named `Switch grip` also starts with `Switch_` after loading; rotating that mesh independently would deform the assembly.

| Export | Bytes | Triangles | Meshes |
| --- | ---: | ---: | ---: |
| flight-equipment.glb | 823,232 | 16,692 | 11 |
| checklist.glb | 284,616 | 2,086 | 8 |
| navigation.glb | 475,460 | 7,148 | 7 |
| seatbelts.glb | 424,712 | 5,100 | 13 |
| meals.glb | 661,100 | 14,726 | 15 |
| electrical.glb | 531,044 | 8,396 | 16 |

The six exports total **3,200,164 bytes and 54,148 triangles**. Every export embeds its atlas and requires no external texture, Draco or Meshopt decoder. The installed-fixture bounds are `[-3.53, 0, -13.45]` to `[3.467, 2.46, 13.35]` in game coordinates. PBR metalness/roughness and emissive instrument screens use exportable glTF materials. No paid generation, downloaded models or external textures were used for this original equipment kit. User-supplied character derivatives are a separate asset pipeline; their attribution does not apply to these props.
