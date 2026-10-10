# Supplying models and voices for FLIGHT 404

The current game has its own Blender-authored, rigged airline cast and does **not** require more character files to animate. The AI attendant, player attendant, pilot, marshal, engineer and three passenger appearances each have sixteen authored movement/action clips, including seatbelt, oxygen mask, life vest and exit demonstrations. Five original safety props are also included. Supplied scans and earlier derivatives remain preserved; they are no longer the active characters.

You do **not** need to model, rig or animate anything yourself. Welcome, seatbelt and chime audio are now installed. Optional additional recordings or model upgrades can improve the flight experience without blocking the playable story.

## Flight announcement audio

The supplied `welcome.m4a`, `seatbelt.mp3` and `service chime.mp3` are installed. The seatbelt explanation plays during the first, 14.5-second safety demonstration step; it is not reused as a turbulence warning. This supersedes the earlier version with no recorded clips.

Useful remaining cues are `service`, `turbulence`, `secure`, `approach`, `emergency` and `landed`. Put files in the project-root `voice/` folder with `.mp3`, `.m4a`, `.ogg` or `.wav` extensions. Aim for 3–12 seconds, similar volume, clear speech and no background music. Accepted names and preparation instructions are in [voice/README.md](../voice/README.md).

Run `npm run assets:voice` and reload the browser; normal dev/build commands also prepare clips. Enable cabin sound in the game. Captions, generated engine ambience and fallback chimes work without additional files. Add the downloaded recordings' original source URLs, creator and permission/license details beside the audio; these have not yet been supplied. Optional passenger request filenames are reserved but not yet triggered by gameplay.

## Optional future models

Use **GLB (.glb / binary glTF 2.0)** with embedded PBR textures. One asset per file is easiest to inspect and replace. A Blender `.blend` source alongside the GLB is helpful; a `.blend` alone is not a browser runtime asset. Keep source and license information with each asset.

1. **More detailed crew/passengers:** neutral A- or T-pose, full body, distinct arms/legs/fingers and separated clothing parts where practical. A humanoid skeleton and good skin weights are useful; supplied animation is optional. Neutral geometry can be rigged and animated locally, while fused sculpture poses can require substantial rebuilding. Target 20–40k triangles with shared 1K/2K textures.
2. **Seat and seatbelt kit:** separate buckle, straps, tray table and latch with useful pivots. Target 5–15k triangles per reusable seat unit.
3. **Galley equipment:** detailed trolley, cup, bottle and meal containers. Keep doors, wheels, brake and locking handle independent. The game already includes original functional service props, so these would be visual upgrades.
4. **Cockpit equipment:** separate display surfaces, yoke, throttle and switches. Blank screens let runtime game data replace painted text.

These are project targets, not mandatory import requirements. Larger sources can be inspected and optimized. The original cast's base source is `models/blender/animated-crew.blend`; rebuild it with `scripts/blender/build_animated_crew.py`, then run `scripts/blender/add_safety_demonstrations.py` to restore the current sixteen-clip cast and safety props. Its augmented source is `models/blender/animated-crew-safety.blend`. No externally generated or paid models are needed to reproduce it.

## Export conventions and gameplay anchors

- Metres; applied scale; ground pivot at the local origin; +Y up and forward −Z in the exported GLB. Current characters are approximately 1.77m tall.
- Embed colour, roughness/metalness and normal textures when used. The current original cast uses vertex colours instead of texture files.
- Preserve readable names and separate moving parts, for example `Galley_Door`, `Breaker_01`, `Display_Surface`. Preserve skeletons/weights and named clips rather than flattening them.
- Avoid external texture URLs or compression that needs an unbundled decoder.
- The cabin is 7.4m wide and approximately 31.45m long, with floor bounds Z=−13.65 to 17.8. The cockpit doorway is 1.5m wide. Passenger seats sit at X=±1.9/±2.95, rows Z=−7/−4/−1/2/5, with cushions at Y=0.57. The pilot chair is at X=−1.65, Z=−11.05.
- The aft trolley duty is at X=−2.55, Z=15.5; maintenance equipment at X=2.6, Z=12.3; final cabin inspection at X=0, Z=−8.5. Artwork may improve without changing these shared gameplay anchors.
- The safety demonstration station is at X=0, Z=−8.6. The player presses E nearby, arranges the instruction cards, then performs all four steps facing the cabin. Keep this front aisle space clear for the 26.5-second public performance.

`shared/world.ts` owns collision and interaction positions; decorative meshes do not define movement. Cabin/equipment exports live in `client/public/models/interior/`, original characters in `client/public/models/animated/`, handheld supplies in `client/public/models/service/`, and safety props in `client/public/models/safety/`. Earlier scan derivatives remain in `client/public/models/characters/` with their credits.

The supplied Boeing is retained unchanged, with extended landing-gear nodes hidden on runtime clones for cruise. That is a gear-up pose, not an authored retraction animation. Outside views use locally generated clouds/terrain, not satellite imagery. See [ASSETS.md](ASSETS.md) for rebuild commands and manifests. Blender 5.2.2 LTS was used; no extra model-production service is required.
