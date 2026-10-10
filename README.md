# FLIGHT 404

A playable desktop-browser prototype of an aircraft-crew social deduction game. Walk a stylized 3D airliner, complete aircraft tasks, coordinate with your crew, and uncover a saboteur. Built with React, TypeScript, Vite, React Three Fiber, Three.js, and Colyseus.

## Run locally

Use **Node.js 22 or newer** and npm.

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the client on port **5173** and Colyseus runs on port **2567**. Keep the terminal running. To join from another computer on the same network, open `http://YOUR_LAN_IP:5173` and allow both ports through the host firewall.

For one browser, choose **Explore a solo training flight**. For multiplayer, choose **Create a flight**, share the flight code, and have **3–10 players** join. Everyone marks ready; the host starts the flight. Additional browser tabs/windows can stand in for other players when testing. Each connection is a separate player; this prototype does not require accounts.

## How to play

| Control | Action |
| --- | --- |
| W / A / S / D | Walk |
| Click cabin, then move mouse | Capture pointer and look |
| Right-drag or arrow keys | Look without pointer capture |
| E | Open the nearby task station |
| Tab | Show task list |
| M | Show cabin layout |
| Escape | Release pointer / close panels |

Read your private allegiance after departure, then walk the central aisle to task stations. All public roles can help with all tasks. Repeat each station's highlighted sequence to verify it. The crew wins by completing all five checks or detaining every saboteur, before the six-minute timer or system integrity runs out. Saboteurs use their private disruption buttons to threaten the flight; the crew restores affected systems at the indicated station. Open **Intercom** to chat and **Report** to call a vote. A strict majority is required to detain a player. Detained players observe until the round ends, and their allegiance remains private.

Public roles describe crew identity; hidden allegiance is a separate assignment. The prototype uses fictional system disruptions and does not provide operational aircraft procedures.

## What's implemented

- A procedural aircraft interior with a flight deck, passenger cabin, aft galley, and maintenance bay.
- First-person walking, mouse look, solid walls/furniture, nearby interaction prompts, and visible remote crew members.
- A multiplayer lobby with room codes, ready state, public crew roles, and a private allegiance sent to each player.
- Five sequence-based tasks, plus sabotage, repairs, emergency meetings, voting, and round outcomes.
- A solo training mode for trying the complete task loop.
- Server-owned movement, task state, round rules, and flight telemetry.

The initial models are code-generated meshes, with shared floor-layout data for collision and task placement. They are original prototype assets that require no external model download or paid generation. See [the asset plan](docs/ASSETS.md) for construction details and how to replace them with production GLB assets.

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

The integration test creates real Colyseus WebSocket clients and temporary rooms. It checks multiplayer round flow, private allegiance delivery, task validation, movement, sabotage authorization, meetings, and disconnect behavior. To target another test server:

```sh
COLYSEUS_URL=ws://localhost:2567 npm run test:integration
```

Do not point this test at a populated production server: it intentionally creates rooms, moves players, and exercises round state changes.

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

Start with **one server instance**. Rooms live in process memory; restarting the process ends active sessions. Horizontal scaling requires shared Colyseus presence/driver configuration and routing that keeps each room on its owning process. Function-only/static hosting cannot run this multiplayer server.

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
- `server/`: Colyseus room rules and the HTTP/static application.
- `tests/`: Deterministic world checks and live multiplayer integration coverage.

The `FlightController` interface in `server/src/systems/flight.ts` exposes autopilot/manual mode and telemetry separately from first-person crew movement. A future manual controller can implement the same `reset`, `step`, and `snapshot` methods. This keeps cockpit inputs, flight dynamics, and autopilot transitions separate from crew tasks and social rules. The prototype's flight telemetry is a simplified simulation; it is not an aerodynamic flight model.

## Prototype limits

This is a desktop-first vertical slice. It does not yet include touch controls, voice chat, account authentication, persistence, matchmaking services, reconnect recovery, dedicated mobile optimization, or production-scale abuse protection. The aircraft uses stylized procedural art and simplified collisions. Network state is server-owned, but a production competitive game still needs further protocol hardening, load testing, moderation, and operational monitoring.
