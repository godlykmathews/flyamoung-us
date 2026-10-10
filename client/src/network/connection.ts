const CONNECTION_FAILURE = 'Could not connect to the flight server. Check that the multiplayer backend is online and VITE_SERVER_URL points to it, then try again.';

/** SDK and proxy errors may contain nested objects instead of an Error message. */
export function connectionErrorMessage(error: unknown, fallback = CONNECTION_FAILURE): string {
  const seen = new Set<unknown>();
  function read(value: unknown, depth = 0): string | undefined {
    if (typeof value === 'string') {
      const message = value.trim();
      return message && !message.includes('[object Object]') ? message : undefined;
    }
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) return;
    seen.add(value);
    const fields = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'reason', 'cause']) {
      const message = read(fields[key], depth + 1);
      if (message) return message;
    }
  }
  return read(error) ?? fallback;
}

export function resolveServerEndpoint(configured: string | undefined, pageUrl: string): string {
  const page = new URL(pageUrl);
  let endpoint: URL;
  if (configured?.trim()) {
    try { endpoint = new URL(configured.trim()); }
    catch { throw new Error('VITE_SERVER_URL must be the full HTTPS or WSS URL of the multiplayer backend. Update it and redeploy the frontend.'); }
  } else {
    endpoint = new URL(page.origin);
    if (page.port === '5173' || page.port === '4173') endpoint.port = '2567';
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('VITE_SERVER_URL must be an HTTP(S) or WS(S) server URL without credentials, a query, or a fragment. Update it and redeploy the frontend.');
  }
  endpoint.protocol = endpoint.protocol === 'https:' || endpoint.protocol === 'wss:' ? 'wss:' : 'ws:';
  if (page.protocol === 'https:' && endpoint.protocol !== 'wss:') {
    throw new Error('This HTTPS page needs a secure multiplayer connection. Set VITE_SERVER_URL to the backend’s wss:// URL and redeploy the frontend.');
  }
  return endpoint.toString().replace(/\/+$/, '');
}

export function serverHealthUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/health`;
  return url.toString();
}

/** Detect a frontend-only deployment before the SDK turns its 404 into [object Object]. */
export async function checkFlightServer(endpoint: string, fetcher: typeof fetch = fetch, timeoutMs = 12_000): Promise<void> {
  const healthUrl = serverHealthUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const missingServer = () => new Error(`No FLIGHT 404 multiplayer server was found at ${new URL(endpoint).host}. Deploy the room server, set VITE_SERVER_URL to its public URL, and redeploy the frontend.`);
  try {
    const response = await fetcher(healthUrl, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (response.status === 404 || response.status === 405) throw missingServer();
    if (!response.ok) throw new Error(`The flight server is unavailable (HTTP ${response.status}). Check the backend deployment and try again.`);
    if (!response.headers.get('content-type')?.includes('application/json')) throw missingServer();
    let health: unknown;
    try { health = await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; throw missingServer(); }
    if (!health || typeof health !== 'object' || !('game' in health) || health.game !== 'flight-404' || !('status' in health) || health.status !== 'ok') throw missingServer();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The flight server took too long to respond. It may be starting up; wait a moment and try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the flight server. Check that the backend is online, VITE_SERVER_URL is correct, and CLIENT_ORIGIN allows this website.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
