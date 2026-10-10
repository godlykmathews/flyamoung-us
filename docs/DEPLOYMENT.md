# Deploying FLIGHT 404

The browser and Colyseus room server are separate parts of the game. The included Vercel configuration publishes the browser build; the current room server runs as one persistent Node.js process. Use the same current source revision for both.

## Current deployment

| Component | Address / setting |
| --- | --- |
| Game | `https://flyamoung-us.vercel.app` |
| Render backend | `https://flight-404-server.onrender.com` |
| Backend health | `https://flight-404-server.onrender.com/health` |
| Vercel Production `VITE_SERVER_URL` | `wss://flight-404-server.onrender.com` |
| Render `CLIENT_ORIGIN` | `https://flyamoung-us.vercel.app` |

The Render service uses the Free plan in Singapore and follows the `master` branch. Vercel also publishes `master`. Allow both deployments to finish after pushing an update. The frontend URL above is the supported production origin; additional preview domains need explicit backend allowlist entries.

## 1. Start the room server

Use Node.js 22.x from the repository root:

```sh
npm ci
npm run build
npm start
```

For a container host, use the existing [Docker instructions](../README.md#docker). No particular hosting provider is required. The host must keep the process running, forward HTTP requests and WebSocket upgrades, and provide HTTPS/WSS for public browser connections.

Configure these runtime variables on the server:

| Variable | Value |
| --- | --- |
| `PORT` | The port expected by the host; defaults to `2567` |
| `CLIENT_ORIGIN` | Your frontend's exact HTTPS origin, without a trailing slash |

For the current frontend, set `CLIENT_ORIGIN=https://flyamoung-us.vercel.app` on the backend. This is the browser origin, not the backend address.

Multiple allowed frontend origins can be comma-separated. Add each preview origin explicitly if it needs multiplayer access. Restart the server after changing its runtime environment. A restart ends active flights.

Open the backend's HTTPS `/health` URL. It must return JSON containing `"status":"ok"` and `"game":"flight-404"`. An HTML page or a Vercel 404 is not the room server. Keep one instance: room state and four-digit codes are in memory.

Create, join and solo practice all check this endpoint before connecting. The browser reports a missing backend, invalid/insecure URL, unreachable server or timeout with a readable error. Solo practice still uses the server simulation.

### Option: Render Web Service for prototype testing

The repository includes [render.yaml](../render.yaml) with the free backend configuration. After committing and pushing it, you can import the repository as a Render Blueprint. Alternatively, create a Web Service manually using the same settings below.

In [Render](https://dashboard.render.com/), create **New → Web Service** and connect this GitHub repository. Select the branch containing the current server code and use:

| Setting | Value |
| --- | --- |
| Language | Node |
| Root Directory | Leave empty |
| Build Command | `npm ci --include=dev && npx tsc -p tsconfig.server.json` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instance count | One |
| Environment | `NODE_VERSION=22`, `CLIENT_ORIGIN=https://flyamoung-us.vercel.app` |

The backend-only build intentionally skips the Vite frontend because Vercel already serves it. Render supplies the port; the server reads `PORT`. After deployment, verify the service's HTTPS `/health` address. Use its hostname with `wss://` for Vercel's `VITE_SERVER_URL` in the next section. For example, a backend at `https://your-service.onrender.com` uses `wss://your-service.onrender.com`. Replace that example with the actual assigned hostname.

Render supports [Node web services](https://render.com/docs/deploy-node-express-app) and [WebSockets](https://render.com/docs/websocket). Its [free plan](https://render.com/docs/free) is suitable for prototype testing: it sleeps after 15 minutes without inbound traffic and can take about a minute to wake. Wait for `/health` to respond before retrying a flight. Restarts end this prototype's in-memory rooms. Choose any paid plan only after reviewing its price; a free service is enough for the initial deployment check.

## 2. Configure the Vercel frontend

Import the repository and use these settings:

| Setting | Value |
| --- | --- |
| Root Directory | Leave empty: repository root |
| Framework Preset | Vite |
| Node.js Version | `22.x` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

[vercel.json](../vercel.json) supplies the framework, install, build and output settings. Set the root and Node version in the project settings. `client/` is Vite's internal root; Vercel must start at the repository root so it can find `package.json`, `vite.config.ts` and `shared/`. This follows [Vercel's Vite deployment workflow](https://vercel.com/docs/frameworks/frontend/vite).

Add the environment variable **`VITE_SERVER_URL`** with the room server's public **`wss://` URL**. Use the actual backend domain, not the Vercel frontend domain or `localhost`. Enable the variable for Production and for any Preview deployments that should connect to this backend. The matching frontend origin must also be allowed by the backend's `CLIENT_ORIGIN`.

Redeploy after saving the variable: Vite embeds it during the build. Changing an environment value without a new build does not update a published browser bundle. `VITE_` variables are public; never place passwords or tokens in them.

There is no catch-all rewrite in the project configuration. This app opens at `/`, and missing model, audio or JavaScript files should return a real 404 instead of an HTML application page.

Vercel's [WebSocket support in Functions](https://vercel.com/docs/functions/websockets) does not automatically adapt this server. Function duration limits and separate instances require room coordination and reconnect handling. The current configuration deploys the Vite frontend and expects a separate running backend.

## 3. Check the published game

1. Open the published frontend, create a flight, and join its four-digit code from another browser.
2. In the browser's Network panel, verify matchmaking requests go to the backend and the room WebSocket connects successfully.
3. Confirm the start page shows **FLIGHT 404**, **Trust your crew.**, and **Solo practice**, with the light airline theme and aircraft model.
4. Check the frontend's `/models/boeing-737.glb`, `/models/interior/aircraft-cabin.glb` and `/voice/manifest.json` return their actual files. A `.glb` response must be binary model data, not HTML. Hashed JavaScript and CSS URLs linked by the page must also succeed.

## Troubleshooting

The older-UI checks below are diagnostic possibilities, not a finding that a published deployment is stale. Compare the actual deployed commit and loaded assets before rebuilding or changing deployment settings.

| Symptom | Check |
| --- | --- |
| Create/join fails or the old build shows `[object Object]` | Confirm the backend `/health` response, the build-time `VITE_SERVER_URL`, HTTPS/WSS, backend logs and `CLIENT_ORIGIN`. A static frontend cannot create rooms on its own. |
| The hosted UI looks older than local | Check the deployment's Git commit and production branch. Commit `f86c3a9` introduced the light airline UI and new assets; deploy that revision or a newer revision containing it. Commit `5f94ad5` has the earlier green, text-heavy UI. |
| A new deployment still shows old files | Confirm the production domain points at the intended deployment, redeploy the correct commit without reusing the build cache, then hard-reload the page. Verify the loaded CSS/JS filenames belong to that deployment. |
| Aircraft looks simplified or art is missing | Check the model requests above and publish `dist`, which includes `client/public` assets. The aircraft has a simplified fallback when its model fails. Do not rewrite missing asset requests to `index.html`. |
| Fonts look different | Check whether the Google Fonts stylesheet is blocked by the browser or network; layout uses fallback fonts if it cannot load. |
| Panels differ between development and the production build | Keep `styles.css` imported before `App` in `client/src/main.tsx`, so component styles override the base HUD and drawer styles in both builds. |
| Backend is healthy but the room disconnects | Verify WebSocket forwarding, the server's allowed origin, and that only one instance is serving rooms. Check whether the process restarted or idled. |
| A preview works but production fails | Check that `VITE_SERVER_URL` is enabled for Production, rebuild production, and include its exact frontend origin in the backend allowlist. |

Local automated checks are `npm test` and `npm run build`. With a running backend, `COLYSEUS_URL=ws://localhost:2567 npm run test:integration` checks multiplayer behavior. These do not prove that a particular hosted deployment has the correct environment, domain routing or assets; perform the published-game checks after deployment.
