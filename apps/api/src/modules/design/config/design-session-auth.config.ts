/**
 * Anonymous Design Session authorization configuration (`IMP-D043`, `APP3-B06A`).
 *
 * `IMP-D043` PO-02 requires the secret pepper to come from runtime secret
 * configuration and to **fail loudly with no fallback**. That is enforced here:
 * a missing or too-short pepper throws at configuration load, and there is no
 * default, no development shortcut and no silent empty string. A peppered HMAC
 * whose pepper is `''` verifies exactly like an unpeppered one, which is the
 * failure this rejects.
 *
 * The pepper is read once, held only in this object, and never logged,
 * serialized or placed in a request context. Nothing in this file reads a real
 * operator secret at build time: the variable is declared here and supplied by
 * the environment at run time, and tests use synthetic values only.
 *
 * Rate limits are the `IMP-D043` PO-07 values, verbatim and not tunable by
 * environment: they are a product ruling, not a knob.
 */
import { normalizeOrigin } from '../../identity/config/staff-auth.config';

export const DESIGN_SESSION_AUTH_CONFIG = Symbol('DESIGN_SESSION_AUTH_CONFIG');

/** The environment variable carrying the HMAC pepper. Never read into a log. */
export const DESIGN_SESSION_PEPPER_ENV = 'DESIGN_SESSION_SECRET_PEPPER';

/**
 * Minimum pepper length.
 *
 * The session secret is already 256 bits of CSPRNG, so the pepper's job is to
 * make a stolen database useless rather than to add entropy to the secret. 32
 * characters is the smallest value that cannot be a placeholder someone typed.
 */
export const MIN_PEPPER_LENGTH = 32;

export interface DesignSessionRateLimits {
  /** PO-07: authorized mutations, 30/minute per session id. */
  readonly mutation: { readonly max: number; readonly windowMs: number };
  /**
   * PO-07: bootstrap, resume and read, 60/minute per ephemeral network key.
   *
   * A **locked `IMP-D043` PO-07 control**, ruled at `APP3-G03` on 2026-08-04
   * alongside the other four, and implemented here at `APP3-S06`.
   *
   * The delay is worth recording, because the reason for it was a misreading
   * rather than an omission. `APP3-B06C` shipped the first anonymous Session
   * *read* route, looked for a read limit, concluded PO-07 defined only four
   * controls — creation, creation burst, mutation and authorization failure —
   * and disclosed the absence as `FU-APP3-B06C-READ-RATE-LIMIT-01` rather than
   * inventing a number. Refusing to invent one was right; the premise was not.
   * PO-07's own text reads "bootstrap/resume/read **60/minute** per ephemeral
   * network key", and `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` has carried it
   * in the locked limits table since the ruling. This object was the thing that
   * was incomplete, not the decision.
   *
   * It bounds what an *authorized* caller may read. Without it, a caller holding
   * a valid Session credential could probe Asset ids indefinitely, bounded only
   * by the 122 bits of a UUIDv4 and by every miss being indistinguishable.
   */
  readonly read: { readonly max: number; readonly windowMs: number };
  /** PO-07: authorization failures, 10 per 15 minutes per network key and session id. */
  readonly authorizationFailure: { readonly max: number; readonly windowMs: number };
  /** PO-07: session creation, 5/hour per ephemeral network key. */
  readonly creation: { readonly max: number; readonly windowMs: number };
  /** PO-07: the creation burst ceiling, 2/minute per ephemeral network key. */
  readonly creationBurst: { readonly max: number; readonly windowMs: number };
}

export interface DesignSessionAuthConfig {
  /** HMAC pepper. Present, non-empty and never exposed. */
  readonly secretPepper: string;
  /** Exact allowed browser origins; empty means no browser mutation is possible. */
  readonly allowedOrigins: readonly string[];
  /** `Secure` on the session cookie. Always true in production (`__Host-`). */
  readonly cookieSecure: boolean;
  readonly rateLimits: DesignSessionRateLimits;
}

const MINUTE_MS = 60_000;

/**
 * `IMP-D043` PO-07, verbatim — all **five** controls, not the four this object
 * carried until `APP3-S06`. None of them is environment-tunable: they are
 * product rulings, not knobs.
 */
const RATE_LIMITS: DesignSessionRateLimits = Object.freeze({
  mutation: { max: 30, windowMs: MINUTE_MS },
  read: { max: 60, windowMs: MINUTE_MS },
  authorizationFailure: { max: 10, windowMs: 15 * MINUTE_MS },
  creation: { max: 5, windowMs: 60 * MINUTE_MS },
  creationBurst: { max: 2, windowMs: MINUTE_MS },
});

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid ${name} "${raw}": expected "true" or "false".`);
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  const origins: string[] = [];
  for (const entry of raw.split(',')) {
    const normalized = normalizeOrigin(entry);
    if (normalized === undefined) {
      throw new Error(`Invalid DESIGN_SESSION_ALLOWED_ORIGINS entry "${entry.trim()}".`);
    }
    if (!origins.includes(normalized)) origins.push(normalized);
  }
  return origins;
}

/**
 * Loads and validates the configuration.
 *
 * The pepper error deliberately names the variable and nothing else — never the
 * value, never its length, never a fragment.
 */
export function loadDesignSessionAuthConfig(env: NodeJS.ProcessEnv): DesignSessionAuthConfig {
  const pepper = env[DESIGN_SESSION_PEPPER_ENV];
  if (pepper === undefined || pepper.trim() === '') {
    throw new Error(
      `${DESIGN_SESSION_PEPPER_ENV} is required: anonymous Design Session secrets are ` +
        'verified with a peppered HMAC and there is no unpeppered fallback.',
    );
  }
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(
      `${DESIGN_SESSION_PEPPER_ENV} must be at least ${String(MIN_PEPPER_LENGTH)} characters.`,
    );
  }

  const environment = env['NODE_ENV'] ?? 'development';
  const cookieSecure = parseBoolean(
    env['DESIGN_SESSION_COOKIE_SECURE'],
    environment === 'production',
    'DESIGN_SESSION_COOKIE_SECURE',
  );
  // `__Host-` is meaningless without `Secure`; production must never weaken it.
  if (environment === 'production' && !cookieSecure) {
    throw new Error(
      'DESIGN_SESSION_COOKIE_SECURE must be true in production: the __Host- prefix requires it.',
    );
  }

  return {
    secretPepper: pepper,
    allowedOrigins: parseAllowedOrigins(env['DESIGN_SESSION_ALLOWED_ORIGINS']),
    cookieSecure,
    rateLimits: RATE_LIMITS,
  };
}
