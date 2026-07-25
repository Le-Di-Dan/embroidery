/**
 * Staff-authentication configuration (ADR-APP1-001 §4–§7).
 *
 * Parsed once, centrally, and validated: numeric ranges are bounded and the
 * production secure-cookie policy fails fast (a `__Host-` cookie is impossible
 * without `Secure`). Bootstrap secrets are deliberately absent — they are read
 * only by the CLI application context, never required for normal API startup.
 *
 * Values are read from the environment at provider construction so a test can
 * set them before booting the module and restore them afterwards.
 */
import type { AppEnvironment } from '../../../config/app-config';

export const STAFF_AUTH_CONFIG = Symbol('STAFF_AUTH_CONFIG');

export interface RateLimitRule {
  readonly max: number;
  readonly windowMs: number;
}

export interface StaffAuthConfig {
  readonly environment: AppEnvironment;
  readonly cookieSecure: boolean;
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  readonly passwordMinLength: number;
  readonly identifierRateLimit: RateLimitRule;
  readonly ipRateLimit: RateLimitRule;
  readonly globalRateLimit: RateLimitRule;
  /** Normalized allowlist (`scheme://host[:port]`, lowercased, no trailing slash). */
  readonly allowedOrigins: readonly string[];
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const DEFAULTS = {
  idleTimeoutMinutes: 30,
  absoluteTimeoutHours: 12,
  passwordMinLength: 12,
  identifier: { max: 5, windowMinutes: 15 },
  ip: { max: 20, windowMinutes: 15 },
  global: { max: 100, windowMinutes: 5 },
} as const;

const VALID_ENVIRONMENTS = ['development', 'test', 'production'] as const;

function isAppEnvironment(value: string): value is AppEnvironment {
  return (VALID_ENVIRONMENTS as readonly string[]).includes(value);
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${name} "${raw}": expected an integer >= ${min}.`);
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`Invalid ${name} "${raw}": expected "true" or "false".`);
}

/**
 * Normalizes an origin to `scheme://host[:port]`, dropping a default port and
 * any path. Returns `undefined` for anything that is not a valid absolute
 * origin, so a malformed allowlist entry is rejected rather than silently
 * matching nothing.
 */
export function normalizeOrigin(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.username !== '' || url.password !== '' || (url.pathname !== '' && url.pathname !== '/')) {
    return undefined;
  }
  const defaultPort =
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80');
  const port = url.port === '' || defaultPort ? '' : `:${url.port}`;
  return `${url.protocol}//${url.hostname.toLowerCase()}${port}`;
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  const origins: string[] = [];
  for (const entry of raw.split(',')) {
    const normalized = normalizeOrigin(entry);
    if (normalized === undefined) {
      throw new Error(`Invalid STAFF_ALLOWED_ORIGINS entry "${entry.trim()}".`);
    }
    if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  return origins;
}

/** Loads and validates the staff-auth configuration from the environment. */
export function loadStaffAuthConfig(env: NodeJS.ProcessEnv): StaffAuthConfig {
  const rawEnvironment = env['NODE_ENV'] ?? 'development';
  if (!isAppEnvironment(rawEnvironment)) {
    throw new Error(`Invalid NODE_ENV "${rawEnvironment}".`);
  }

  const cookieSecure = parseBoolean(
    env['STAFF_SESSION_COOKIE_SECURE'],
    rawEnvironment === 'production',
    'STAFF_SESSION_COOKIE_SECURE',
  );

  // A `__Host-` cookie requires Secure; production must never fall back to a
  // non-secure admin cookie (ADR §5, BACKEND_CONVENTIONS §16).
  if (rawEnvironment === 'production' && !cookieSecure) {
    throw new Error(
      'STAFF_SESSION_COOKIE_SECURE must be true in production: the admin session ' +
        'cookie requires the Secure attribute and the __Host- prefix.',
    );
  }

  const idleMinutes = parseInteger(
    env['STAFF_SESSION_IDLE_TIMEOUT_MINUTES'],
    DEFAULTS.idleTimeoutMinutes,
    'STAFF_SESSION_IDLE_TIMEOUT_MINUTES',
    1,
  );
  const absoluteHours = parseInteger(
    env['STAFF_SESSION_ABSOLUTE_TIMEOUT_HOURS'],
    DEFAULTS.absoluteTimeoutHours,
    'STAFF_SESSION_ABSOLUTE_TIMEOUT_HOURS',
    1,
  );

  return {
    environment: rawEnvironment,
    cookieSecure,
    idleTimeoutMs: idleMinutes * MINUTE_MS,
    absoluteTimeoutMs: absoluteHours * HOUR_MS,
    passwordMinLength: parseInteger(
      env['STAFF_PASSWORD_MIN_LENGTH'],
      DEFAULTS.passwordMinLength,
      'STAFF_PASSWORD_MIN_LENGTH',
      1,
    ),
    identifierRateLimit: {
      max: parseInteger(
        env['STAFF_LOGIN_RATE_LIMIT_IDENTIFIER_MAX'],
        DEFAULTS.identifier.max,
        'STAFF_LOGIN_RATE_LIMIT_IDENTIFIER_MAX',
        1,
      ),
      windowMs:
        parseInteger(
          env['STAFF_LOGIN_RATE_LIMIT_IDENTIFIER_WINDOW_MINUTES'],
          DEFAULTS.identifier.windowMinutes,
          'STAFF_LOGIN_RATE_LIMIT_IDENTIFIER_WINDOW_MINUTES',
          1,
        ) * MINUTE_MS,
    },
    ipRateLimit: {
      max: parseInteger(
        env['STAFF_LOGIN_RATE_LIMIT_IP_MAX'],
        DEFAULTS.ip.max,
        'STAFF_LOGIN_RATE_LIMIT_IP_MAX',
        1,
      ),
      windowMs:
        parseInteger(
          env['STAFF_LOGIN_RATE_LIMIT_IP_WINDOW_MINUTES'],
          DEFAULTS.ip.windowMinutes,
          'STAFF_LOGIN_RATE_LIMIT_IP_WINDOW_MINUTES',
          1,
        ) * MINUTE_MS,
    },
    globalRateLimit: {
      max: parseInteger(
        env['STAFF_LOGIN_RATE_LIMIT_GLOBAL_MAX'],
        DEFAULTS.global.max,
        'STAFF_LOGIN_RATE_LIMIT_GLOBAL_MAX',
        1,
      ),
      windowMs:
        parseInteger(
          env['STAFF_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_MINUTES'],
          DEFAULTS.global.windowMinutes,
          'STAFF_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_MINUTES',
          1,
        ) * MINUTE_MS,
    },
    allowedOrigins: parseAllowedOrigins(env['STAFF_ALLOWED_ORIGINS']),
  };
}
