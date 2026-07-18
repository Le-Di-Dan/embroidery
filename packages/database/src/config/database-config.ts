/**
 * Startup configuration validation for the persistence layer (DB6 §21).
 *
 * Fails fast on invalid or missing values instead of falling back silently.
 * A dedicated validation library is an open decision, so this mirrors the
 * hand-rolled style of `apps/api/src/config/app-config.ts`.
 *
 * Security rules enforced here:
 * - the connection URL is never returned in a loggable form (see `redactUrl`);
 * - production may not run without TLS;
 * - production may not use the documented development password.
 */

const VALID_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const VALID_SSL_MODES = ['disable', 'require', 'verify-full'] as const;

export type DatabaseEnvironment = (typeof VALID_ENVIRONMENTS)[number];
export type DatabaseSslMode = (typeof VALID_SSL_MODES)[number];

export interface DatabaseConfig {
  readonly url: string;
  readonly environment: DatabaseEnvironment;
  readonly sslMode: DatabaseSslMode;
  readonly expectedMajorVersion: number;
  readonly poolMax: number;
  readonly idleTimeoutMs: number;
  readonly connectionTimeoutMs: number;
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
}

const DEFAULTS = {
  poolMax: 10,
  idleTimeoutMs: 30_000,
  connectionTimeoutMs: 10_000,
  statementTimeoutMs: 30_000,
  lockTimeoutMs: 5_000,
  expectedMajorVersion: 16,
} as const;

/** Documented in `.env.example`; must never reach a deployed environment. */
const DEVELOPMENT_PASSWORD = 'embroidery_dev_password';

const MAX_TIMEOUT_MS = 600_000;
const MAX_POOL = 100;

function isEnvironment(value: string): value is DatabaseEnvironment {
  return (VALID_ENVIRONMENTS as readonly string[]).includes(value);
}

function isSslMode(value: string): value is DatabaseSslMode {
  return (VALID_SSL_MODES as readonly string[]).includes(value);
}

function parseBoundedInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid ${name} "${raw}": expected an integer between 1 and ${max}.`);
  }
  return value;
}

/**
 * Redacts credentials so a connection string can appear in logs and errors.
 * Anything unparseable is reported as `<unparseable>` rather than echoed —
 * echoing a malformed URL is the easiest way to leak a password into a log.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password !== '') {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '<unparseable database url>';
  }
}

function parseUrl(raw: string | undefined): URL {
  if (raw === undefined || raw === '') {
    throw new Error('Missing DATABASE_URL: the persistence layer cannot start without it.');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid DATABASE_URL: not a parseable URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `Invalid DATABASE_URL protocol "${parsed.protocol}": expected postgres: or postgresql:.`,
    );
  }
  if (parsed.pathname === '' || parsed.pathname === '/') {
    throw new Error('Invalid DATABASE_URL: no database name in the path.');
  }
  if (parsed.username === '') {
    throw new Error('Invalid DATABASE_URL: no user.');
  }
  return parsed;
}

function assertProductionSafety(
  environment: DatabaseEnvironment,
  sslMode: DatabaseSslMode,
  url: URL,
): void {
  if (environment !== 'production') {
    return;
  }
  if (sslMode === 'disable') {
    throw new Error('DATABASE_SSL_MODE "disable" is not permitted when NODE_ENV=production.');
  }
  if (url.password === DEVELOPMENT_PASSWORD) {
    throw new Error('The development database password is not permitted when NODE_ENV=production.');
  }
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  const rawEnvironment = env['NODE_ENV'] ?? 'development';
  if (!isEnvironment(rawEnvironment)) {
    throw new Error(
      `Invalid NODE_ENV "${rawEnvironment}": expected one of ${VALID_ENVIRONMENTS.join(', ')}.`,
    );
  }

  const url = parseUrl(env['DATABASE_URL']);

  const rawSslMode = env['DATABASE_SSL_MODE'] ?? 'disable';
  if (!isSslMode(rawSslMode)) {
    throw new Error(
      `Invalid DATABASE_SSL_MODE "${rawSslMode}": expected one of ${VALID_SSL_MODES.join(', ')}.`,
    );
  }

  assertProductionSafety(rawEnvironment, rawSslMode, url);

  return {
    url: url.toString(),
    environment: rawEnvironment,
    sslMode: rawSslMode,
    expectedMajorVersion: parseBoundedInteger(
      'DATABASE_EXPECTED_MAJOR',
      env['DATABASE_EXPECTED_MAJOR'],
      DEFAULTS.expectedMajorVersion,
      99,
    ),
    poolMax: parseBoundedInteger(
      'DATABASE_POOL_MAX',
      env['DATABASE_POOL_MAX'],
      DEFAULTS.poolMax,
      MAX_POOL,
    ),
    idleTimeoutMs: parseBoundedInteger(
      'DATABASE_POOL_IDLE_TIMEOUT_MS',
      env['DATABASE_POOL_IDLE_TIMEOUT_MS'],
      DEFAULTS.idleTimeoutMs,
      MAX_TIMEOUT_MS,
    ),
    connectionTimeoutMs: parseBoundedInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      env['DATABASE_CONNECTION_TIMEOUT_MS'],
      DEFAULTS.connectionTimeoutMs,
      MAX_TIMEOUT_MS,
    ),
    statementTimeoutMs: parseBoundedInteger(
      'DATABASE_STATEMENT_TIMEOUT_MS',
      env['DATABASE_STATEMENT_TIMEOUT_MS'],
      DEFAULTS.statementTimeoutMs,
      MAX_TIMEOUT_MS,
    ),
    lockTimeoutMs: parseBoundedInteger(
      'DATABASE_LOCK_TIMEOUT_MS',
      env['DATABASE_LOCK_TIMEOUT_MS'],
      DEFAULTS.lockTimeoutMs,
      MAX_TIMEOUT_MS,
    ),
  };
}
