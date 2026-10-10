# FLIGHT 404

A playable desktop-browser prototype of an aircraft-crew social deduction game. Walk a 3D airliner, order cabin service, help fellow passengers through flight incidents, and uncover a saboteur during a cooperative flight story. Built with React, TypeScript, Vite, React Three Fiber, Three.js, and Colyseus.

## Run locally

Use **Node.js 22 or newer** and npm.

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the client on port **5173** and Colyseus runs on port **2567**. Keep the terminal running. To join from another computer on the same network, open `http://YOUR_LAN_IP:5173` and allow both ports through the host firewall.

For one browser, choose **Solo practice**. For multiplayer, choose **Create flight**, share the **four-digit flight code**, and have **3–10 players** join. Everyone marks ready; the host starts the flight. An eight-second flying animation plays before the private role reveal; choose **Enter cabin** or press Escape to skip it. Additional browser tabs/windows can stand in for other players when testing. Each connection is a separate player; this prototype does not require accounts.

## How to play

| Control | Action |
| --- | --- |
| W / A / S / D | Walk |
| Click cabin, then move mouse | Capture pointer and look |
| Right-drag or arrow keys | Look without pointer capture |
| E | Open a nearby station or the forward safety briefing, deliver the held service item, or open cockpit controls |
| Hold E / hold the interaction button | Guide passengers, secure equipment, fit masks, repair incidents or assist nearby people; stay nearby |
| On board button | Order four different items, read, rest, fasten a seatbelt or open solo emergency practice |
| G | Passenger requests and galley supplies |
| Q | Draw or conceal a weapon, visible to other players (saboteurs only) |
| F | Attack a nearby player or NPC with a drawn weapon (saboteurs only) |
| Tab / M | Flight duties / cabin layout |
| Drag yoke / arrow keys in cockpit panel | Counter turbulence and hold the flight marker in the centre box |
| Escape | Release pointer / close panels; skip the departure sequence |

Read your private allegiance after departure. Public jobs and hidden allegiances are assigned independently: a saboteur has the same model and uniform as an ordinary player in that job. A three-player flight includes a Captain, Cabin Crew member and Air Marshal; larger crews add Engineer, First Officer and Passenger roles. Most cabin duties are open to every player, including the solo player. Disarming an exposed attacker is reserved for the Captain, First Officer or Air Marshal; solo practice permits every duty.

The journey progresses through four chapters:

1. **Departure:** present the safety demonstration at the front of the cabin, secure the trolley in the new aft lounge and guide a standing passenger back to their seat.
2. **Service:** collect a requested item from the aft galley, carry it to the correct seat and deliver it. The shared quota is one human delivery in solo practice, two in multiplayer. AI deliveries improve comfort but do not complete this mission for you.
3. **Turbulence:** guide two passengers to their seats, secure the maintenance equipment, and use the flight-deck yoke to keep both flight axes near centre for ten seconds. The server validates continuous control and proximity. A cabin-pressure incident can also occur during this chapter: fit a mask and restore the aft pressure console.
4. **Approach:** hold the forward cabin inspection after living passengers are seated, and resolve any active system emergency.

Passengers can stand and enter the aisle. Approach them and **hold E** until the progress bar completes; they walk back and sit in their own seat. Release the key or leave interaction range to cancel. Chapter transitions wait for living passengers to finish sitting, even when the displayed duties are complete.

For the safety demonstration, walk to the front of the passenger cabin and press **E**. Arrange the illustrated cards in this order: **seatbelt → oxygen mask → life vest → exits**. Drag cards or use their arrow buttons, then choose **Begin demonstration**. A correct arrangement starts a public, 26.5-second performance by your own character, with a cinematic view, equipment props and instruction captions. Other players see the same demonstration. The seatbelt step lasts 14.5 seconds for its recorded explanation; the other three steps last four seconds each. The duty completes after the performance finishes. Only one player can prepare it at a time; meetings pause it, and leaving the preparation area or cancelling releases the station.

Press **G** to view water, coffee, meal and blanket requests. Collect one item at the aft galley, walk to its passenger, then press **E** or use **Serve**. The AI attendant walks the aisle, fetches supplies and serves NPC requests after a 15-second human priority window. Missed NPC requests reduce comfort and slightly reduce integrity. Passengers, the seated pilot and the attendant can all be eliminated; killing the attendant releases its requests so players can take over. An unresponsive pilot leaves autopilot engaged and can be recovered through a nearby held assistance action.

Open **On board** to request **water, coffee, a meal and a blanket**, one at a time. Each different delivery fills one of four progress slots. Other players see your request in **Service** and can bring the matching item from the galley. After a 20-second priority window, the AI attendant can physically fetch and deliver a player order; requests expire after 90 seconds. Reading opens a flight magazine, resting gives a quiet moment, and fastening the belt marks it secured. Walking ends these activities and releases the belt.

**On board → Emergency practice** offers four solo drills without skipping the story: bad weather, oxygen-mask deployment, electrical smoke and pilot medical assistance. Pressure and smoke incidents have an 85-second response window. Fit your own mask before helping another player or restoring pressure at the aft console. Contain smoke at the maintenance cabinet; help the pilot on the flight deck. Release a held action, leave range or lose focus to cancel. Incidents and orders pause during meetings. Drills are unavailable in multiplayer.

Saboteurs see additional private actions in **On board**: carry an incorrect item to upset a requesting NPC, deliver a fictional tainted drink to the pilot, or damage the pressure/electrical station. These require proximity, a continuous hold and a cooldown. Crew can calm an upset passenger. Player attacks incapacitate their target until another nearby player completes a rescue; pilots and marshals can hold an intervention against an exposed attacker to disarm and detain them. Public models and uniforms never reveal allegiance, and all held experience actions share the same generic public progress data.

The crew wins by completing the journey or detaining every saboteur before the **six-minute timer** or integrity runs out. Active incidents, uncontrolled weather, an unresponsive pilot or an incapacitated player must be resolved before a crew victory. The five original equipment checks remain available as supporting tasks and emergency repairs; completing those alone no longer wins the flight. Saboteurs have private disruption, elimination and manifest objectives. After the initial ten-second delay, elimination has a 25-second cooldown, requires a clear view within reach, and requires the weapon to have been visibly drawn for at least 600 ms. Attacks and eliminations are non-graphic. An integrity failure plays a skippable, nine-second exterior emergency descent above Earth and clouds before the debrief; it does not show ground impact or change the server outcome.

Use **Intercom** to discuss observations and **Report** to call a meeting. A strict majority detains one player; their allegiance stays private and detained players observe. Meetings pause the journey and cabin simulation. The system disruptions and cockpit balance game are fictional gameplay, not operational aircraft procedures.

## What's implemented

- A 7.4 m wide, approximately 31.45 m long Blender cabin, extended by four metres aft, with 20 seats, galley, flight deck, maintenance bay and crew lounge/vestibule.
- New aft catering trolley, storage, lavatory facade, luggage, folded jumpseat and emergency equipment.
- Original Blender-built, rigged airline characters: AI and player attendants, pilot, marshal, engineer and three passenger appearances. All eight have sixteen clips, including four safety demonstrations alongside walking, carrying, serving, sitting, standing, gesturing, bracing, weapon presentation and non-graphic unresponsive poses.
- An illustrated safety-card arrangement task and synchronized physical performance, with five original Blender props: two belt halves, an oxygen mask, a folded life vest and a worn life vest.
- Twelve seated passenger NPCs, a fixed seated pilot, autonomous attendant service for NPC and human requests, and smooth replicated player/NPC movement.
- Four-item personal service progress, a flight magazine, rest and seatbelts; covert wrong orders and pilot illness; player incapacitation, rescue and role-gated disarming.
- Shared pressure and smoke incidents, twenty instanced overhead masks, glowing aisle guidance, an aft pressure display, storm lighting, smoke and restrained turbulence motion.
- A nine-second emergency-descent presentation above Earth and clouds after integrity failure, with reduced-motion support and no impact sequence.
- Four-digit multiplayer rooms, ready state, private allegiance, role duties, held world interactions, cockpit balance controls, sabotage, voting and outcomes.
- Moving clouds and original procedural earth/coastline scenery below the aircraft, visible through cabin windows and the cockpit windscreen and in the live 3D departure sequence.
- Light airline UI, captioned announcements, generated engine/weather/pressure ambience, optional incident audio cues, and installed welcome, seatbelt and attention-chime recordings.
- Server-owned movement, action timing, NPC routes, requests, story progression, flight-control input and hidden-role rules.

The current active cast is authored from scratch in Blender; it is not dependent on deforming the earlier static character scans. Editable `.blend` files and scripts are included. Supplied source models and earlier derivatives remain preserved, with their attribution. The Boeing exterior remains the supplied CC BY 4.0 model by SAIMON584Models. See [docs/ASSETS.md](docs/ASSETS.md) for asset origins, dimensions and rebuild commands.

## Add flight voices

Three user-supplied recordings are installed: **`welcome.m4a`**, **`seatbelt.mp3`** and **`service chime.mp3`**. Enable **Cabin sound** to hear them. The seatbelt recording explains fastening the belt and plays during that demonstration; it is not used as a turbulence warning. Captions and generated engine ambience also work. This supersedes the earlier milestone with an empty voice manifest.

Add further recordings to the project-root `voice/` folder; `.mp3`, `.m4a`, `.ogg` and `.wav` are accepted. Priority additions are `turbulence-loop`, `oxygen-mask-drop`, `turbulence` and `pressure-warning`; optional smoke, pilot-medical, recovery and caution cues are also wired. Exact filenames, durations and descriptions are listed under **Next sounds to add** in [voice/README.md](voice/README.md). Installed media details, filenames and preparation instructions are in [voice/README.md](voice/README.md). The downloaded recordings' source URLs and licenses have not yet been supplied; retain that information with the audio.

```sh
npm run assets:voice
```

With the Vite development server, reload the browser after preparing clips, then enable cabin sound. For the production app on port 2567, run `npm run build` after adding audio so it is copied into `dist/`, then reload. `npm run dev` and `npm run build` also prepare clips automatically. Recorded passenger request voices are not yet triggered; those names are reserved for a later update. There is no voice chat or online speech service.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

With the server running in another terminal:

```sh
npm run test:integration
```

The current automated milestone passes **54 unit tests** and **all four live integration scenarios**. The integration test creates real Colyseus WebSocket clients and temporary rooms. It checks four-digit room creation/joining, private allegiance delivery, private safety cards and public timed demonstrations, physical actions and service, visible weapons and attendant death, sabotage/repair, meetings and votes, the complete solo story including pressure recovery, four human player orders, mask assistance, attacks/rescues, disarming and emergency victory gating, ten-client movement and disconnect behavior. To target another test server:

```sh
COLYSEUS_URL=ws://localhost:2567 npm run test:integration
```

To run only one scenario, set `TEST_SCENARIO=multiplayer`, `training`, `experience` or `concurrency`.

Do not point this test at a populated production server: it intentionally creates rooms, moves players, and exercises round state changes.

The recorded browser checks and verification limits are in [docs/TESTING.md](docs/TESTING.md).

## Production build

```sh
npm run build
npm start
```

Open [http://localhost:2567](http://localhost:2567). The Node server serves the compiled frontend from `dist/` and accepts Colyseus WebSocket connections on the same port. Set the `PORT` environment variable if your host uses another port, for example `PORT=8080 npm start`. `npm run preview` previews the static frontend only; use `npm start` for the complete production app.

### Docker

```sh
docker build -t flight-404 .
docker run --rm -p 2567:2567 -e PORT=2567 flight-404
```

Deploy this image to a host supporting **long-running Node processes and WebSockets**. Bind public traffic to port 2567, terminate TLS at the hosting platform or reverse proxy, and forward WebSocket upgrades. Browser access over HTTPS requires WSS for the game connection. The container provides a `/health` health check.

Start with **one server instance**. Rooms live in process memory; restarting the process ends active sessions. Four-digit room codes reserve 1000–9999 in this process and are released when rooms close. Horizontal scaling requires shared Colyseus presence/driver configuration, shared atomic room-code reservations and routing that keeps each room on its owning process. The current server starts a persistent Node process; it has not been adapted to a functions runtime.

### Vercel frontend

The included [vercel.json](vercel.json) builds and publishes the browser app. In Vercel, leave **Root Directory empty** (the repository root), select **Node.js 22.x**, and use the Vite preset, `npm ci`, `npm run build`, and output directory `dist`. Do not set the root to `client`: the package, shared code and build configuration live at the repository root. See [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

Run the current Colyseus backend separately using the Node or Docker instructions above. Set **`VITE_SERVER_URL` in Vercel before building** to that backend's public `wss://` URL, then redeploy. Set **`CLIENT_ORIGIN` on the backend** to the exact HTTPS origin of your Vercel frontend. The frontend and backend must run the same current code. A Vite deployment alone does not start `npm start` or host the multiplayer rooms.

Vercel now offers WebSockets in Functions, but connections have a maximum duration and new connections can reach different instances. This prototype's in-memory rooms, room codes and lack of reconnect recovery require additional work before using that architecture. See [Vercel's WebSocket documentation](https://vercel.com/docs/functions/websockets).

For step-by-step settings, connection checks and an outdated-UI checklist, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Separate frontend and server hosts

You can deploy `dist/` to a static host and run the server elsewhere. Before building the client, set its public server URL:

```sh
VITE_SERVER_URL=wss://your-game-server.example.com npm run build
```

Or put the same variable in `client/.env.local` before building. Vite embeds this value at **build time**; changing the server's runtime environment does not rewrite an already-built frontend. For Docker builds with a separate endpoint:

```sh
docker build --build-arg VITE_SERVER_URL=wss://your-game-server.example.com -t flight-404 .
```

Set the server's `CLIENT_ORIGIN` runtime environment variable to the frontend's HTTPS origin, for example `https://your-game.example.com`. Multiple browser origins can be comma-separated. When omitted, the prototype accepts connections from any browser origin. This is an origin allowlist, not player authentication.

Keep secrets out of every `VITE_` variable because those values are public browser code. Example environment settings are in [.env.example](.env.example). Server environment variables are read from the process environment; the server does not automatically load a root `.env` file.

## Architecture and extension points

- `client/`: React app, lobby, HUD, task and meeting panels, and the React Three Fiber scene.
- `shared/protocol.ts`: Typed public snapshots, private messages, player roles, and flight-state contracts.
- `shared/world.ts`: Aircraft layout, task stations, collision geometry, and movement rules shared by client and server.
- `server/`: Colyseus room rules and the HTTP/static application; `systems/cabin.ts` owns NPC routes/service, `systems/story.ts` owns chapter objectives and the turbulence controller, `systems/experience.ts` owns incidents, passenger activities and held rescue/covert actions, and `systems/roomCodes.ts` reserves short room IDs.
- `tests/`: Deterministic world checks and live multiplayer integration coverage.

The `FlightController` interface in `server/src/systems/flight.ts` exposes autopilot/manual mode and telemetry separately from first-person crew movement. A future manual controller can implement the same `reset`, `step`, and `snapshot` methods. This keeps cockpit inputs, flight dynamics, and autopilot transitions separate from crew tasks and social rules. The prototype's flight telemetry is a simplified simulation; it is not an aerodynamic flight model.

## Prototype limits

This is a desktop-first vertical slice without touch gameplay, voice chat, account authentication, persistence, reconnect recovery, hosted matchmaking, mobile optimization or production-scale abuse protection. The original cast uses stylized geometry and authored animation, not photorealistic scans or motion capture. Decorative doors and cockpit controls are not full interactive aircraft systems. The yoke is a server-authoritative balance minigame; full aerodynamic manual flight and autopilot blending remain future work. Earth scenery is generated presentation art, not geographic or satellite data, and the departure and emergency descent are live rendered sequences rather than encoded video files. The emergency descent is presentation only: there is no aerodynamic crash, ground collision, structural destruction or impact simulation. New incident poses reuse the existing sixteen-clip cast; dedicated treatment, restraint and reading animations remain future art work.

Only the three supplied recordings are installed; other spoken cues remain optional. The preserved older assets remain in the project but are not the active character cast. See [docs/MODEL_REQUEST.md](docs/MODEL_REQUEST.md) for optional future art and voice inputs. A production competitive release still needs load testing, security review, moderation and operational monitoring. Docker setup is supplied but has not been built in the recorded validation; no hosted deployment is included.
