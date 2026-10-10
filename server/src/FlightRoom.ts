import { Room, ServerError, type Client } from '@colyseus/core';
import { CLIENT_MESSAGES } from '../../shared/protocol.js';
import { FlightGame } from './systems/game.js';

export class FlightRoom extends Room {
  private game!: FlightGame;
  private lastSync = new Map<string, number>();
  onCreate(options: { training?: unknown } = {}) {
    const training = options.training === true;
    this.maxClients = training ? 1 : 10;
    this.autoDispose = true;
    this.setPatchRate(null); // This prototype sends explicit, inspectable public snapshots.
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
    this.clock.setInterval(() => this.broadcast('snapshot', this.game.snapshot()), 100);
    this.clock.setInterval(() => this.game.syncSecrets(), 1000);
  }
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
