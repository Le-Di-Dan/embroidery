/**
 * Lifecycle owner for the single isolated API host process. It centralises the
 * exact spawn spec (built dist, staff-auth env) and exposes start/stop/restart
 * so both the normal setup path and the E01-C1-J02 API-unavailability journey
 * drive one authoritative handle. Because the service always tracks the current
 * child (and only that child), teardown stopping the service guarantees zero
 * residual API processes no matter how many times it was restarted.
 */
import { join } from 'node:path';

import { startProcess } from './processes.mjs';
import { waitForHttp } from './net.mjs';

/** The readiness contract: HTTP 200 with a JSON body of `{ status: 'ready' }`. */
async function readyPredicate(res) {
  if (res.status !== 200) {
    return false;
  }
  try {
    const body = await res.clone().json();
    return body?.status === 'ready';
  } catch {
    return false;
  }
}

/**
 * @param {{ config: object, databaseUrl: string, adminOrigins: string }} params
 * @returns {{ start: () => Promise<void>, stop: () => Promise<void>, restart: () => Promise<void>, isRunning: () => boolean, tail: () => string, readinessUrl: string }}
 */
export function createApiService({ config, databaseUrl, adminOrigins }) {
  const storage = config.storage;
  const spec = {
    name: 'api',
    command: process.execPath,
    args: ['dist/main.js'],
    cwd: join(config.repoRoot, 'apps', 'api'),
    env: {
      NODE_ENV: 'test',
      API_PORT: String(config.ports.api),
      DATABASE_URL: databaseUrl,
      DATABASE_SSL_MODE: 'disable',
      API_DOCS_ENABLED: 'false',
      // Staff-auth wiring so real browser login works through the gateway
      // (ADR-APP1-001 §5–§6). Non-secure dev cookie (`adm_session`) over plain
      // HTTP; the browser origin(s) allowlisted for the login/logout mutations.
      STAFF_SESSION_COOKIE_SECURE: 'false',
      STAFF_ALLOWED_ORIGINS: adminOrigins,
      // The IDENTIFIER limit (the E01-J04 boundary under test) stays at the
      // locked default (5 / 15 min). The IP and global ceilings are raised so the
      // single-host harness — where every browser request shares one source IP —
      // does not couple otherwise-independent journeys; those ceilings are
      // orthogonal abuse guards, not the policy verified here.
      STAFF_LOGIN_RATE_LIMIT_IP_MAX: '1000',
      STAFF_LOGIN_RATE_LIMIT_GLOBAL_MAX: '1000',
      // The API verifies its private buckets before it listens (APP2-I03), so
      // the E2E edge points it at this run's ephemeral MinIO. Passed
      // explicitly rather than inherited: a developer's ambient
      // `OBJECT_STORAGE_*` must never send an E2E run at a real store.
      OBJECT_STORAGE_PROVIDER: 's3',
      OBJECT_STORAGE_ENDPOINT: storage.endpoint,
      OBJECT_STORAGE_REGION: 'us-east-1',
      OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
      OBJECT_STORAGE_ACCESS_KEY_ID: storage.accessKeyId,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: storage.secretAccessKey,
      OBJECT_STORAGE_ORIGINALS_BUCKET: storage.originalsBucket,
      OBJECT_STORAGE_DERIVATIVES_BUCKET: storage.derivativesBucket,
    },
  };
  const readinessUrl = `http://localhost:${config.ports.api}/api/health/readiness`;

  let handle;

  async function start() {
    if (handle !== undefined) {
      return;
    }
    const started = startProcess(spec);
    await waitForHttp(readinessUrl, {
      predicate: readyPredicate,
      label: 'api readiness',
      timeoutMs: 60_000,
    }).catch(async (error) => {
      // Failed to come up: reap the half-started process so nothing leaks.
      await started.stop();
      throw new Error(`${error.message}\napi log tail:\n${started.tail()}`);
    });
    handle = started;
  }

  async function stop() {
    if (handle === undefined) {
      return;
    }
    const current = handle;
    handle = undefined;
    await current.stop();
  }

  async function restart() {
    await stop();
    await start();
  }

  return {
    start,
    stop,
    restart,
    isRunning: () => handle !== undefined,
    tail: () => handle?.tail() ?? '',
    readinessUrl,
  };
}
