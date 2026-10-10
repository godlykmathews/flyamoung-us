import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { FlightRoom } from './FlightRoom.js';

const app = express();
app.disable('x-powered-by');
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true }));
app.get('/health', (_request, response) => response.json({ status: 'ok', game: 'flight-404' }));
const clientDist = path.resolve(process.cwd(), 'dist');
if (existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (_request, response) => response.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_request, response) => response.type('text').send('FLIGHT 404 multiplayer server is online. Run npm run dev:client for the browser app, or npm run build first.'));
}
const httpServer = createServer(app);
const transport = new WebSocketTransport({ server: httpServer, maxPayload: 16 * 1024,
  verifyClient: allowedOrigins?.length ? ({ origin }: { origin: string }) => !origin || allowedOrigins.includes(origin) : undefined,
});
const gameServer = new Server({ transport, gracefullyShutdown: false, greet: false });
gameServer.define('flight', FlightRoom);
const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
await gameServer.listen(port, '0.0.0.0');
console.log(`FLIGHT 404 server listening on http://localhost:${port}`);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.log('Shutting down FLIGHT 404…');
  try { await gameServer.gracefullyShutdown(false); process.exit(0); }
  catch (error) { console.error(error); process.exit(1); }
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
