import assert from 'node:assert/strict';
import test from 'node:test';
import { checkFlightServer, connectionErrorMessage, resolveServerEndpoint, serverHealthUrl, waitForFlightServer } from '../client/src/network/connection.js';

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

test('startup retries transient network and gateway failures using health GETs only', { timeout: 1_000 }, async t => {
  let requests = 0;
  let waiting = 0;
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://rooms.example/health');
    assert.equal(options?.method ?? 'GET', 'GET');
    requests++;
    if (requests === 1) throw new TypeError('Failed to fetch');
    if (requests <= 4) return new Response('', { status: [502, 503, 504][requests - 2] });
    return Response.json({ status: 'ok', game: 'flight-404' });
  };
  await waitForFlightServer('wss://rooms.example', {
    fetcher, signal: t.signal, onWaiting: () => waiting++,
    totalTimeoutMs: 500, attemptTimeoutMs: 100, retryDelayMs: 5,
  });
  assert.equal(requests, 5);
  assert.ok(waiting > 0, 'show a startup status while retrying');
});

test('an attempt timeout can recover on the next health request', { timeout: 1_000 }, async t => {
  let requests = 0;
  let aborted = false;
  const fetcher: typeof fetch = async (_url, options) => {
    requests++;
    if (requests > 1) return Response.json({ status: 'ok', game: 'flight-404' });
    return new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  };
  await waitForFlightServer('wss://rooms.example', {
    fetcher, signal: t.signal, totalTimeoutMs: 500, attemptTimeoutMs: 20, retryDelayMs: 5,
  });
  assert.equal(aborted, true);
  assert.equal(requests, 2);
});

test('the total startup budget bounds a stalled request even when its attempt timeout is longer', { timeout: 1_000 }, async t => {
  let requests = 0;
  let aborted = false;
  const fetcher: typeof fetch = async (_url, options) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  };
  const started = performance.now();
  await assert.rejects(waitForFlightServer('wss://rooms.example', {
    fetcher, signal: t.signal, totalTimeoutMs: 40, attemptTimeoutMs: 5_000, retryDelayMs: 5,
  }));
  assert.ok(performance.now() - started < 500, 'do not wait for the full attempt timeout');
  assert.equal(t.signal.aborted, false);
  assert.equal(aborted, true);
  assert.equal(requests, 1);
});

test('the total startup budget bounds backoff and permanently failing requests', { timeout: 1_000 }, async t => {
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; throw new TypeError('Failed to fetch'); };
  const started = performance.now();
  await assert.rejects(waitForFlightServer('wss://rooms.example', {
    fetcher, signal: t.signal, totalTimeoutMs: 40, attemptTimeoutMs: 100, retryDelayMs: 5_000,
  }));
  assert.ok(performance.now() - started < 500, 'do not sleep beyond the total budget');
  assert.equal(t.signal.aborted, false);
  assert.equal(requests, 1);
});

test('permanent network failures stop retrying when the startup budget expires', { timeout: 1_000 }, async t => {
  let requests = 0;
  const started = performance.now();
  await assert.rejects(waitForFlightServer('wss://rooms.example', {
    fetcher: async () => { requests++; throw new TypeError('Failed to fetch'); },
    signal: t.signal, totalTimeoutMs: 50, attemptTimeoutMs: 100, retryDelayMs: 10,
  }));
  assert.ok(requests > 1 && requests <= 7, 'retry briefly without an unbounded or tight loop');
  assert.ok(performance.now() - started < 500);
  assert.equal(t.signal.aborted, false);
});

test('startup fails immediately for a missing or incorrect backend instead of retrying it', { timeout: 1_000 }, async t => {
  const responses = [
    new Response('', { status: 404 }),
    new Response('', { status: 405 }),
    new Response('<!doctype html><div id="root"></div>', { headers: { 'content-type': 'text/html' } }),
    new Response('{broken JSON', { headers: { 'content-type': 'application/json' } }),
    Response.json({ status: 'ok', game: 'another-game' }),
    Response.json({ status: 'ok' }),
  ];
  for (const response of responses) {
    let requests = 0;
    let waiting = 0;
    await assert.rejects(waitForFlightServer('wss://rooms.example', {
      fetcher: async () => { requests++; return response; },
      signal: t.signal, onWaiting: () => waiting++,
      totalTimeoutMs: 100, attemptTimeoutMs: 50, retryDelayMs: 5,
    }), /No FLIGHT 404 multiplayer server/);
    assert.equal(requests, 1);
    assert.equal(waiting, 0);
  }
});

const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError';

test('startup with an already cancelled signal never starts a health request', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(waitForFlightServer('wss://rooms.example', {
    signal: controller.signal,
    fetcher: async () => { requests++; return Response.json({ status: 'ok', game: 'flight-404' }); },
  }), isAbortError);
  assert.equal(requests, 0);
});

test('cancelling an in-flight health request aborts it without retrying', { timeout: 1_000 }, async t => {
  const controller = new AbortController();
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  let requests = 0;
  let aborted = false;
  const fetcher: typeof fetch = async (_url, options) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
      signalStarted();
    });
  };
  const pending = waitForFlightServer('wss://rooms.example', {
    fetcher, signal: AbortSignal.any([controller.signal, t.signal]),
    totalTimeoutMs: 500, attemptTimeoutMs: 200, retryDelayMs: 5,
  });
  await started;
  controller.abort();
  await assert.rejects(pending, isAbortError);
  assert.equal(aborted, true);
  assert.equal(requests, 1);
});

test('cancelling during startup backoff stops promptly without another fetch', { timeout: 1_000 }, async t => {
  const controller = new AbortController();
  let signalWaiting!: () => void;
  const waiting = new Promise<void>(resolve => { signalWaiting = resolve; });
  let requests = 0;
  const pending = waitForFlightServer('wss://rooms.example', {
    fetcher: async () => { requests++; return new Response('', { status: 503 }); },
    signal: AbortSignal.any([controller.signal, t.signal]), onWaiting: signalWaiting,
    totalTimeoutMs: 5_000, attemptTimeoutMs: 200, retryDelayMs: 2_000,
  });
  await waiting;
  const started = performance.now();
  controller.abort();
  await assert.rejects(pending, isAbortError);
  assert.ok(performance.now() - started < 500);
  assert.equal(requests, 1);
});

test('the waiting callback can cancel before a retry timer starts', { timeout: 1_000 }, async t => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(waitForFlightServer('wss://rooms.example', {
    fetcher: async () => { requests++; throw new TypeError('Failed to fetch'); },
    signal: AbortSignal.any([controller.signal, t.signal]), onWaiting: () => controller.abort(),
    totalTimeoutMs: 5_000, attemptTimeoutMs: 200, retryDelayMs: 2_000,
  }), isAbortError);
  assert.equal(requests, 1);
});
