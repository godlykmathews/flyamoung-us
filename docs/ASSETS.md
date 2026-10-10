# Aircraft art and asset pipeline

The prototype's aircraft is original procedural art built with Three.js and React Three Fiber. It does not download stock models, paid assets, textures, or fonts. The geometry lives in `client/src/scene/Aircraft.tsx` and works offline after the application loads.

## What is built now

- A walkable 27.5-metre interior with a segmented curved ivory shell, teal seats, overhead bins, blue window vistas, carpet, aisle guidance lights, an open flight-deck entrance, instrument consoles, galley cabinets and a maintenance power cabinet.
- Twenty seats use instanced meshes for repeated seat pieces. Shared geometry and materials reduce duplication throughout the cabin.
- Task tablets, row labels, safety markings and fictional instrument displays are generated with the browser's Canvas API. There are no font or texture network requests.
- A separate exterior aircraft for the lobby uses a lathed fuselage, extruded swept wings, teal vertical stabilizer, engines and cabin windows. It is presentation art; it is not the interior collision mesh.
- All materials are simple, physically based materials with restrained metal and fabric values. The viewport owns lighting, camera, atmosphere and tone mapping.

The initial look is intentionally stylized: a warm, readable commercial-aircraft environment built for first-person play and clear task locations. The cockpit instruments are decorative; the prototype does not simulate real flight systems.

## How production assets can replace the prototype

Model the aircraft as a modular kit in Blender: two-metre cabin shell sections, window sections, seats, bin sections, bulkheads, doors, cockpit consoles, galley carts and electrical cabinets. Start from the procedural scene's dimensions so artwork can improve without moving gameplay anchors. Use the existing original art as the visual reference, or create reference images before modeling. AI-generated concept images may help art direction; a single generated image is not a usable, collision-ready 3D aircraft.

Export cleaned meshes as glTF binary (`.glb`), with applied transforms, authored UVs, sensible object origins, outward normals and named materials. Keep texture sets small and share material atlases among repeated props. Verify each model at normal first-person eye height and in the darkest playable lighting. For commissioned, generated or purchased replacements, record authorship, source, license and tool/provider terms before bundling them.

Recommended conventions:

- One unit equals one metre; +Y is up; the aircraft nose points toward -Z. Cabin floor is Y=0, eye height is 1.68, ceiling is 3.2 and side walls are X=±3.
- Reusable asset pivots sit on the floor at the item's local centre. Keep each imported asset in a wrapper that converts export orientation once, if needed.
- Put exported art in `client/public/assets/aircraft/`. Use semantic names such as `seat-double.glb`, `cabin-section.glb`, `cockpit-console.glb` and `galley-cabinet.glb`.
- Preserve task positions and row spacing from `shared/world.ts`. Treat task IDs as gameplay identity, never derive them from mesh names or click targets.
- Author simplified collision separately. `shared/world.ts` is currently the shared movement authority; decorative meshes never decide whether a player can walk somewhere. Update and test collision explicitly when changing the layout.
- Keep seats and repeated cabin sections instanced where practical. Merge static parts that share a material, but retain independent objects needed for animation or interaction.
- Inspect the exported GLB in the actual browser build, check network sizes and frame time, and add distance-based detail only when measured needs justify it. Texture compression and mesh compression require compatible decoders shipped with the app.

## Hybrid flight architecture

Keep the stationary interior's local coordinates independent of an eventual aircraft world transform. Flight simulation should update a vehicle pose and flight-system state; exterior visuals, window scenery and instruments can consume that state. First-person crew movement remains local to the aircraft. An autopilot and manual controls can then write into the same flight-control interface without coupling meshes to simulation rules.

The present prototype provides the art and interior layout foundation. Animated doors, working yokes, real gauges, exterior damage and bespoke character animation remain future asset work.
