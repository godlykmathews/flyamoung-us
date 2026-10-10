import assert from 'node:assert/strict';
import test from 'node:test';
import { checkFlightServer, connectionErrorMessage, resolveServerEndpoint, serverHealthUrl } from '../client/src/network/connection.js';

test('local Vite, preview and same-origin production resolve to the room server', () => {
  assert.equal(resolveServerEndpoint(undefined, 'http://localhost:5173/'), 'ws://localhost:2567');
  assert.equal(resolveServerEndpoint('', 'http://127.0.0.1:4173/'), 'ws://127.0.0.1:2567');
  assert.equal(resolveServerEndpoint(undefined, 'http://[::1]:5173/'), 'ws://[::1]:2567');
  assert.equal(resolveServerEndpoint(undefined, 'http://localhost:2567/'), 'ws://localhost:2567');
  assert.equal(resolveServerEndpoint(undefined, 'https://flight.example/play'), 'wss://flight.example');
});

test('configured backend accepts HTTPS or WSS and retains a reverse-proxy base path', () => {
  assert.equal(resolveServerEndpoint(' https://rooms.example/flights/ ', 'https://frontend.example'), 'wss://rooms.example/flights');
  assert.equal(resolveServerEndpoint('wss://rooms.example/', 'https://frontend.example'), 'wss://rooms.example');
  assert.equal(serverHealthUrl('wss://rooms.example/flights/'), 'https://rooms.example/flights/health');
  assert.equal(serverHealthUrl('ws://localhost:2567'), 'http://localhost:2567/health');
});

test('invalid and insecure deployment configuration fails with an actionable message', () => {
  for (const endpoint of ['rooms.example', 'ftp://rooms.example', 'wss://user:password@rooms.example', 'wss://rooms.example?token=secret', 'wss://rooms.example#health']) {
    assert.throws(() => resolveServerEndpoint(endpoint, 'https://frontend.example'), /VITE_SERVER_URL/);
  }
  assert.throws(() => resolveServerEndpoint('ws://rooms.example', 'https://frontend.example'), /secure multiplayer connection/);
  assert.equal(resolveServerEndpoint('http://localhost:3000', 'http://localhost:5173'), 'ws://localhost:3000');
});

test('nested errors retain readable messages and never coerce objects into UI text', () => {
  assert.equal(connectionErrorMessage(new Error('Flight is full.')), 'Flight is full.');
  assert.equal(connectionErrorMessage({ error: { message: 'Room does not exist.' } }), 'Room does not exist.');
  assert.equal(connectionErrorMessage({ message: '[object Object]', cause: { reason: 'Connection refused.' } }), 'Connection refused.');
  const circular: { cause?: unknown } = {}; circular.cause = circular;
  for (const error of [null, undefined, {}, circular, '', new Error('[object Object]'), { message: { status: 404 } }]) {
    assert.equal(connectionErrorMessage(error, 'Readable fallback'), 'Readable fallback');
  }
});

test('health check validates the actual game and avoids cached or credentialed responses', async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://rooms.example/health');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.credentials, 'omit');
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({ status: 'ok', game: 'flight-404' });
  };
  await checkFlightServer('wss://rooms.example', fetcher);
});

test('static Vercel errors and SPA fallbacks cannot be mistaken for a multiplayer backend', async () => {
  const responses = [
    new Response('The page could not be found', { status: 404 }),
    Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }),
    new Response('<!doctype html><div id="root"></div>', { headers: { 'content-type': 'text/html' } }),
    Response.json({ status: 'ok' }),
    Response.json({ status: 'ok', game: 'another-game' }),
    Response.json(null),
    new Response('{bad JSON', { headers: { 'content-type': 'application/json' } }),
  ];
  for (const response of responses) {
    await assert.rejects(checkFlightServer('wss://frontend.vercel.app', async () => response), /No FLIGHT 404 multiplayer server.*VITE_SERVER_URL/);
  }
});

test('unavailable or unreachable backend reports a recovery step', async () => {
  await assert.rejects(checkFlightServer('wss://rooms.example', async () => new Response('', { status: 503 })), /unavailable \(HTTP 503\)/);
  await assert.rejects(checkFlightServer('wss://rooms.example', async () => { throw new TypeError('Failed to fetch'); }), /CLIENT_ORIGIN allows this website/);
});

test('a stalled health request is aborted and becomes a retryable timeout', async () => {
  let aborted = false;
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  });
  await assert.rejects(checkFlightServer('wss://rooms.example', fetcher, 5), /took too long to respond/);
  assert.equal(aborted, true);
});
