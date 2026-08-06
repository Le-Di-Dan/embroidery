#!/usr/bin/env node
/**
 * `APP3-B06A` — the security half, runnable alone.
 *
 * Every check here asserts a property that a working system can violate: a
 * digest compared with `===`, an unpeppered HMAC, a cookie found by scanning,
 * a refusal that names its reason, an Origin policy with an absent-is-fine
 * branch, a rate-limit key carrying a digest, a request context handing a
 * secret to a handler. None of those break a feature, which is exactly why
 * they need a gate rather than a test.
 *
 * Split from `check-app3-b06a.mjs` on responsibility: these are the checks a
 * reviewer runs when the question is "is the credential handled correctly",
 * and the parent's are for "is the scope and the record right". It owns the
 * shared file map so the dependency runs one way only.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULE_DIR = 'apps/api/src/modules/design';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  report: 'docs/implementation/reports/APP3-B06A-COMPLETION-REPORT.md',
  rootManifest: 'package.json',
  apiManifest: 'apps/api/package.json',
  module: `${MODULE_DIR}/design.module.ts`,
  config: `${MODULE_DIR}/config/design-session-auth.config.ts`,
  outcomes: `${MODULE_DIR}/domain/design-session-authorization.ts`,
  verifier: `${MODULE_DIR}/infrastructure/crypto/design-session-secret.verifier.ts`,
  cookies: `${MODULE_DIR}/infrastructure/http/design-session-cookie.policy.ts`,
  origins: `${MODULE_DIR}/infrastructure/http/design-session-origin.policy.ts`,
  limiter: `${MODULE_DIR}/infrastructure/rate-limit/design-session-rate-limiter.ts`,
  networkKey: `${MODULE_DIR}/infrastructure/rate-limit/ephemeral-network-key.service.ts`,
  service: `${MODULE_DIR}/application/authorize-design-session.service.ts`,
  guard: `${MODULE_DIR}/presentation/guards/design-session.guard.ts`,
  context: `${MODULE_DIR}/presentation/design-session-context.ts`,
  port: `${MODULE_DIR}/domain/repositories/design-session.repository.ts`,
  repository: `${MODULE_DIR}/infrastructure/persistence/drizzle-design-session.repository.ts`,
  unitSpec: `${MODULE_DIR}/design-session-auth.spec.ts`,
  integrationSpec: 'apps/api/test/integration/design-session-auth.integration.spec.ts',
  slidingWindow: 'apps/api/src/platform/rate-limit/sliding-window-rate-limiter.ts',
  loginLimiter: 'apps/api/src/modules/identity/infrastructure/rate-limit/login-rate-limiter.ts',
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Strips comments, so prose describing a refusal never reads as the thing itself. */
export function code(text) {
  return text.replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
}

/**
 * The files `APP3-B06A` owns.
 *
 * Scope checks read these rather than the whole module: the design module also
 * holds the DB7-era repositories, whose `attachAsset` predates this checkpoint
 * by several phases, and flagging those would be a gate that fails on history.
 */
export const OWNED = Object.freeze([
  'config',
  'outcomes',
  'verifier',
  'cookies',
  'origins',
  'limiter',
  'networkKey',
  'service',
  'guard',
  'context',
  'module',
]);

export function ownedSources(rootDir) {
  return OWNED.map((key) => [CANONICAL_FILES[key], read(rootDir, key) ?? '']);
}

/** 5 — the cookie name is derived, never discovered. */
export function checkCookieAuthority(rootDir, fail) {
  const cookies = read(rootDir, 'cookies');
  if (cookies === undefined) {
    fail(`${CANONICAL_FILES.cookies}: missing`);
    return;
  }
  const body = code(cookies);
  if (!body.includes("'__Host-nettheu_ds_'")) {
    fail(`${CANONICAL_FILES.cookies}: the locked cookie prefix is gone`);
  }
  if (!/export function buildDesignSessionCookieName\(sessionId: string\)/.test(body)) {
    fail(`${CANONICAL_FILES.cookies}: no canonical cookie-name helper`);
  }
  if (!/isCanonicalSessionId\(sessionId\)/.test(body)) {
    fail(`${CANONICAL_FILES.cookies}: the id is not validated before it becomes a header name`);
  }
  // Extraction must compare against the derived name, never search for a value.
  if (!/=== wanted/.test(body)) {
    fail(`${CANONICAL_FILES.cookies}: extraction does not match the derived name exactly`);
  }
  for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=']) {
    if (!body.includes(attribute)) {
      fail(`${CANONICAL_FILES.cookies}: the deletion cookie omits ${attribute}`);
    }
  }
  if (/Domain=/.test(body)) {
    fail(`${CANONICAL_FILES.cookies}: a Domain attribute breaks the __Host- prefix`);
  }
}

/** 6, 7 — peppered HMAC, timing-safe, no plain comparison. */
export function checkVerifier(rootDir, fail) {
  const verifier = read(rootDir, 'verifier');
  if (verifier === undefined) {
    fail(`${CANONICAL_FILES.verifier}: missing`);
    return;
  }
  const body = code(verifier);
  if (!/createHmac\('sha256', this\.config\.secretPepper\)/.test(body)) {
    fail(`${CANONICAL_FILES.verifier}: the digest is not HMAC-SHA-256 under the runtime pepper`);
  }
  if (!/timingSafeEqual\(/.test(body)) {
    fail(`${CANONICAL_FILES.verifier}: the comparison is not timing-safe`);
  }
  // Both sides folded to a fixed width first: `timingSafeEqual` throws on a
  // length mismatch, and that throw is itself a signal.
  if (!/createHash\('sha256'\)/.test(body)) {
    fail(
      `${CANONICAL_FILES.verifier}: digests are not normalized to a fixed width before comparison`,
    );
  }
  if (/storedDigest ===|=== storedDigest/.test(body)) {
    fail(`${CANONICAL_FILES.verifier}: compares digests with === , which leaks timing`);
  }
  if (/scrypt|bcrypt|argon/i.test(body)) {
    fail(`${CANONICAL_FILES.verifier}: a password hash is not the ruled verification`);
  }

  const config = code(read(rootDir, 'config') ?? '');
  if (!/DESIGN_SESSION_SECRET_PEPPER/.test(config)) {
    fail(`${CANONICAL_FILES.config}: no pepper variable is declared`);
  }
  if (!/is required/.test(config)) {
    fail(`${CANONICAL_FILES.config}: a missing pepper does not fail loudly`);
  }
  if (/secretPepper: *(''|`|env\[[^\]]*\] *\?\?)/.test(config)) {
    fail(`${CANONICAL_FILES.config}: the pepper has a fallback`);
  }
}

/** 8, 9, 10, 16 — eligibility, one public outcome, clearing, and no writes. */
export function checkAuthorization(rootDir, fail) {
  const service = read(rootDir, 'service');
  if (service === undefined) {
    fail(`${CANONICAL_FILES.service}: missing`);
    return;
  }
  const body = code(service);
  if (!/session\.status !== 'ACTIVE'/.test(body)) {
    fail(`${CANONICAL_FILES.service}: the ACTIVE check is gone`);
  }
  if (!/expiresAt\.getTime\(\) <= now\.getTime\(\)/.test(body)) {
    fail(`${CANONICAL_FILES.service}: the expiry check is gone`);
  }
  // Liveness after the secret, so status is not an oracle for a caller who does
  // not hold the credential.
  if (body.indexOf('verifier.verify') > body.indexOf("status !== 'ACTIVE'")) {
    fail(`${CANONICAL_FILES.service}: liveness is checked before the secret`);
  }
  // Authorization is a read. Anything that writes belongs to a business
  // transaction, not to a guard that every unauthorized probe reaches.
  for (const writer of ['advanceRevision', 'saveDocument', 'attachAsset', 'outbox', 'audit']) {
    if (new RegExp(`\\b${writer}\\b`, 'i').test(body)) {
      fail(`${CANONICAL_FILES.service}: authorization writes (${writer})`);
    }
  }

  const outcomes = code(read(rootDir, 'outcomes') ?? '');
  if (!/export function designSessionUnauthorized\(\)/.test(outcomes)) {
    fail(`${CANONICAL_FILES.outcomes}: no single public authorization failure`);
  }
  const publicMessages = [...outcomes.matchAll(/message: '([^']*)'/g)].map((match) => match[1]);
  for (const message of publicMessages) {
    if (/expired|not found|does not exist|wrong|secret|cookie missing/i.test(message)) {
      fail(`${CANONICAL_FILES.outcomes}: a public message discloses a reason ("${message}")`);
    }
  }
  if (!/CLEAR_COOKIE_REASONS/.test(outcomes)) {
    fail(`${CANONICAL_FILES.outcomes}: no explicit cookie-clearing rule`);
  }
  const clearSet = /CLEAR_COOKIE_REASONS[^=]*=[^[]*\[([\s\S]*?)\]/.exec(outcomes)?.[1] ?? '';
  for (const reason of ['SECRET_MISMATCH', 'SESSION_EXPIRED', 'SESSION_NOT_ACTIVE']) {
    if (!clearSet.includes(reason)) fail(`${CANONICAL_FILES.outcomes}: ${reason} no longer clears`);
  }
  for (const reason of ['COOKIE_MISSING', 'SESSION_NOT_FOUND']) {
    if (clearSet.includes(reason)) {
      fail(
        `${CANONICAL_FILES.outcomes}: ${reason} must not clear — it confirms which half was right`,
      );
    }
  }
}

/** 11 — Origin and Fetch Metadata are both required, with no absent-is-fine branch. */
export function checkOriginPolicy(rootDir, fail) {
  const origins = read(rootDir, 'origins');
  if (origins === undefined) {
    fail(`${CANONICAL_FILES.origins}: missing`);
    return;
  }
  const body = code(origins);
  if (!/sec-fetch-site/.test(body)) {
    fail(`${CANONICAL_FILES.origins}: Sec-Fetch-Site is not checked`);
  }
  if (!/allowedOrigins\.includes\(/.test(body)) {
    fail(`${CANONICAL_FILES.origins}: the allowlist is not matched exactly`);
  }
  if (
    /return true;[\s\S]{0,80}no Origin/i.test(body) ||
    /stated === null[\s\S]{0,60}return true/.test(body)
  ) {
    fail(`${CANONICAL_FILES.origins}: a missing Origin is allowed`);
  }
  if (/headers\['referer'\]/.test(body)) {
    fail(`${CANONICAL_FILES.origins}: Referer is consulted, which a referrer policy may strip`);
  }
  const guard = code(read(rootDir, 'guard') ?? '');
  if (guard.indexOf('origins.evaluate') > guard.indexOf('authorization.authorize')) {
    fail(`${CANONICAL_FILES.guard}: the origin check no longer precedes authorization`);
  }
}

/** 12 — the ruled limits, on the existing primitive, with safe keys. */
export function checkRateLimits(rootDir, fail) {
  const config = code(read(rootDir, 'config') ?? '');
  if (!/mutation: \{ max: 30, windowMs: MINUTE_MS \}/.test(config)) {
    fail(`${CANONICAL_FILES.config}: the PO-07 mutation limit is not 30/minute`);
  }
  if (!/authorizationFailure: \{ max: 10, windowMs: 15 \* MINUTE_MS \}/.test(config)) {
    fail(`${CANONICAL_FILES.config}: the PO-07 failure limit is not 10 per 15 minutes`);
  }
  const limiter = code(read(rootDir, 'limiter') ?? '');
  if (!/SlidingWindowRateLimiter/.test(limiter)) {
    fail(`${CANONICAL_FILES.limiter}: does not reuse the existing rate-limit primitive`);
  }
  if (/class .*RateLimiter[\s\S]*private readonly windows/.test(limiter)) {
    fail(`${CANONICAL_FILES.limiter}: implements a second rate-limit framework`);
  }
  for (const forbidden of ['secretPepper', 'sessionSecretHash', 'digest(']) {
    if (limiter.includes(forbidden)) {
      fail(`${CANONICAL_FILES.limiter}: a rate-limit key carries ${forbidden}`);
    }
  }
  const network = code(read(rootDir, 'networkKey') ?? '');
  if (!/createHmac\('sha256', this\.salt\)/.test(network)) {
    fail(`${CANONICAL_FILES.networkKey}: the network key is not an HMAC under a runtime salt`);
  }
  // The extracted primitive must still be the one identity uses, or there are
  // two implementations again.
  const login = code(read(rootDir, 'loginLimiter') ?? '');
  if (!/extends SlidingWindowRateLimiter/.test(login)) {
    fail(`${CANONICAL_FILES.loginLimiter}: no longer shares the extracted primitive`);
  }
}

/** 13, 14 — the request context carries nothing sensitive; the actor stays truthful. */
export function checkContext(rootDir, fail) {
  const context = read(rootDir, 'context');
  if (context === undefined) {
    fail(`${CANONICAL_FILES.context}: missing`);
    return;
  }
  const body = code(context);
  const shape = /interface DesignSessionContext \{([\s\S]*?)\n\}/.exec(body)?.[1] ?? '';
  for (const field of ['secret', 'hash', 'pepper', 'cookie', 'customer', 'storage']) {
    if (new RegExp(field, 'i').test(shape)) {
      fail(`${CANONICAL_FILES.context}: the request context exposes ${field}`);
    }
  }
  if (!/designSessionId/.test(shape) || !/currentRevision/.test(shape)) {
    fail(`${CANONICAL_FILES.context}: the context omits the id or the revision`);
  }
  // Nothing in the module may claim an actor identity: an anonymous session is
  // not a Customer and not an Admin.
  for (const [file, text] of ownedSources(rootDir)) {
    if (/ActorContext|bindActor|setActor|CUSTOMER'|ADMIN'/.test(code(text))) {
      fail(`${file}: binds or asserts an actor identity for an anonymous session`);
    }
  }
}
