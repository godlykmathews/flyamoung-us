import { Room, ServerError, type Client } from '@colyseus/core';
import { CLIENT_MESSAGES } from '../../shared/protocol.js';
import { reserveRoomCode, releaseRoomCode } from './systems/roomCodes.js';
import { FlightGame } from './systems/game.js';

export class FlightRoom extends Room {
  private game!: FlightGame;
  private lastSync = new Map<string, number>();
  onCreate(options: { training?: unknown } = {}) {
    const training = options.training === true;
    this.roomId = reserveRoomCode();
    try {
    this.maxClients = training ? 1 : 10;
    this.autoDispose = true;
    this.maxMessagesPerSecond = 100;
    this.game = new FlightGame(this.roomId, training, (id, type, payload) => this.clients.find(client => client.sessionId === id)?.send(type, payload));
    for (const type of CLIENT_MESSAGES) this.onMessage(type, async (client, payload: unknown) => {
      if (type === 'sync') {
        const now = Date.now();
        if (now - (this.lastSync.get(client.sessionId) ?? 0) < 200) return;
        this.lastSync.set(client.sessionId, now);
      }
      this.game.handle(client.sessionId, type, payload);
      if (type === 'start' && this.game.currentPhase === 'playing') await this.lock();
      if (type === 'restart' && this.game.currentPhase === 'lobby') await this.unlock();
    });
    this.setSimulationInterval(delta => this.game.step(delta / 1000), 50);
    // Configure this after simulation: Colyseus 0.17 otherwise installs a second
    // clock timer, which would reduce the delta seen by our movement simulation.
    this.setPatchRate(null); // Public snapshots are sent explicitly below.
    this.clock.setInterval(() => this.broadcast('snapshot', this.game.snapshot()), 100);
    this.clock.setInterval(() => this.game.syncSecrets(), 1000);
    } catch (error) { releaseRoomCode(this.roomId); throw error; }
  }
  onDispose() { releaseRoomCode(this.roomId); }
  onAuth() {
    if (this.game.currentPhase !== 'lobby') throw new ServerError(400, 'This flight has already departed.');
    return true;
  }
  onJoin(client: Client, options: { name?: unknown } = {}) {
    this.game.addPlayer(client.sessionId, options.name);
    // Clients request sync once their handlers are attached. The regular
    // snapshots also ensure a fast join never misses its initial room state.
  }
  onLeave(client: Client) { this.game.removePlayer(client.sessionId); this.lastSync.delete(client.sessionId); }
}
