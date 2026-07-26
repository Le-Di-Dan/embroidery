/**
 * API lifecycle control seam for the initial server-side dependency-failure
 * journey (E01-C1-J02). The isolated API runs as a host process owned entirely
 * by the orchestrator (`scripts/run-e2e.mjs`); a Playwright spec cannot reach
 * that process directly. The orchestrator therefore exposes a loopback-only
 * control server whose URL is forwarded as `E2E_API_CONTROL_URL`.
 *
 * These helpers drive that server to stop and restart ONLY the isolated API —
 * never the gateway, Admin, Storefront or PostgreSQL, and never the persistent
 * development stack. Stop/start are synchronous on the server side (start waits
 * for real readiness before responding), so no spec-side sleeping is needed.
 */

function controlUrl(): string {
  const url = process.env.E2E_API_CONTROL_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'E2E_API_CONTROL_URL is not set — the API-unavailable journey must run via `pnpm e2e:app1`.',
    );
  }
  return url;
}

async function command(path: string, method: 'POST' | 'GET'): Promise<{ running: boolean }> {
  const response = await fetch(`${controlUrl()}${path}`, { method });
  if (!response.ok) {
    throw new Error(`API control ${method} ${path} failed with status ${response.status}.`);
  }
  return (await response.json()) as { running: boolean };
}

/** Stops the isolated API and waits until it is no longer serving. */
export async function stopApi(): Promise<void> {
  const { running } = await command('/api/stop', 'POST');
  if (running) {
    throw new Error('API control reported the API still running after stop.');
  }
}

/** (Re)starts the isolated API and waits for real readiness before returning. */
export async function startApi(): Promise<void> {
  const { running } = await command('/api/start', 'POST');
  if (!running) {
    throw new Error('API control reported the API not running after start.');
  }
}

/** Reports whether the isolated API is currently running (orchestrator view). */
export async function apiRunning(): Promise<boolean> {
  const { running } = await command('/api/status', 'GET');
  return running;
}
