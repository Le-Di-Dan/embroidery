/**
 * Networking helpers for deterministic, sleep-free readiness and port checks.
 * No arbitrary sleeps: callers poll a real signal (a listening port, an HTTP
 * readiness contract) with a bounded deadline.
 */
import net from 'node:net';
import http from 'node:http';

/**
 * GET a loopback path with an explicit `Host` header (which `fetch` forbids).
 * Used only by the orchestrator to preflight gateway hostname routing before
 * handing off to the browser. Resolves `{ status, body }`.
 */
export function httpGetWithHost(port, path, host, { timeoutMs = 5_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += String(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timed out')));
    req.once('error', reject);
    req.end();
  });
}

/** Resolves after `ms` — used only between readiness polls, never inside specs. */
export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when nothing is listening on the loopback TCP port. */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** True when something accepts a loopback TCP connection on the port. */
export function isPortListening(port, { timeoutMs = 1000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** Fails fast when a required port is already taken, before any destructive setup. */
export async function assertPortsFree(ports) {
  const taken = [];
  for (const { port, label } of ports) {
    if (!(await isPortFree(port))) {
      taken.push(`${label} (port ${port})`);
    }
  }
  if (taken.length > 0) {
    throw new Error(
      `E2E ports already in use: ${taken.join(', ')}. Stop the conflicting process or set the matching E2E_* port env var.`,
    );
  }
}

/** Waits until a TCP port accepts connections or the deadline passes. */
export async function waitForPort(port, { timeoutMs = 30_000, intervalMs = 500, label } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) {
      return;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label ?? `port ${port}`} after ${timeoutMs}ms.`);
}

/**
 * Polls an HTTP endpoint until `predicate(response)` is truthy or the deadline
 * passes. Returns the final response. Never sleeps beyond the interval.
 * @param {string} url
 * @param {{ timeoutMs?: number, intervalMs?: number, predicate?: (res: Response) => boolean | Promise<boolean>, label?: string, headers?: Record<string,string> }} [options]
 */
export async function waitForHttp(url, options = {}) {
  const { timeoutMs = 60_000, intervalMs = 500, predicate, label, headers } = options;
  const deadline = Date.now() + timeoutMs;
  let lastReason = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers, redirect: 'manual' });
      const ok = predicate ? await predicate(res) : res.ok;
      if (ok) {
        return res;
      }
      lastReason = `status ${res.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label ?? url} after ${timeoutMs}ms: ${lastReason}.`);
}
