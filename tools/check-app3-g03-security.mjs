#!/usr/bin/env node
/**
 * `APP3-G03` — the credential, transport and abuse half of the session gate.
 *
 * Split from `check-app3-g03.mjs` by responsibility, not by line count: this
 * file owns everything about *proving ownership and surviving abuse* — secret
 * generation, cookie transport, rotation, CSRF/origin, enumeration and rate
 * limits — while the sibling owns identity scope, retention, schema and the
 * absence of an implementation.
 *
 * The failure this guards against is a quiet weakening: a cookie that loses
 * `HttpOnly`, a rotation that starts extending TTL, a "temporary" grace window
 * for the previous secret, a raw secret that reappears in a JSON body. Every one
 * of those reads as a small edit and is a full compromise of anonymous
 * ownership, so each is asserted by name against a bounded fact table and the
 * canonical prose that has to keep saying it.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */

/** The per-session cookie. The `<session-id>` suffix is part of the name. */
export const COOKIE_NAME = '__Host-nettheu_ds_<session-id>';

/**
 * Credential, transport and abuse facts, recomputed from the phase plan's
 * bounded table (§6.6.1). The sibling merges these with its own before reading.
 */
export const SECURITY_FACTS = Object.freeze({
  'Session secret bytes': '32',
  'Session secret source': 'SERVER_CSPRNG',
  'Session secret encoding': 'BASE64URL_UNPADDED',
  'Session secret digest': 'HMAC_SHA256_RUNTIME_PEPPER',
  'Session secret comparison': 'CONSTANT_TIME',
  'Session secret persistence': 'DIGEST_ONLY',
  'Session secret browser storage': 'FORBIDDEN',
  'Session secret url transport': 'FORBIDDEN',
  'Session secret json transport': 'FORBIDDEN',
  'Session secret log transport': 'FORBIDDEN',
  'Session pepper absent behaviour': 'FAIL_LOUDLY_NO_FALLBACK',
  'Session cookie name': COOKIE_NAME,
  'Session cookie value': 'RAW_SECRET_ONLY',
  'Session cookie same site': 'Lax',
  'Session cookie path': '/',
  'Session cookie domain': 'NONE',
  'Session cookie http only': 'REQUIRED',
  'Session cookie secure production': 'REQUIRED',
  'Session cookie scope': 'ONE_COOKIE_PER_SESSION',
  'Session cookie max age bound': 'NOT_BEYOND_EXPIRES_AT',
  'Session cookie removal': 'EXPIRY_INVALIDATION_AND_FAILED_AUTHORIZATION',
  'Session bootstrap response': 'PUBLIC_ID_ONLY',
  'Session client persisted handle': 'NON_SECRET_ID_ONLY',
  'Session bearer transport': 'FORBIDDEN',
  'Session staff cookie reuse': 'FORBIDDEN',
  'Studio route': '/san-pham/[slug]/thiet-ke',
  'Session rotation trigger': 'AUTHENTICATED_RESUME',
  'Session rotation write': 'COMPARE_AND_SWAP',
  'Session rotation winners': '1',
  'Session rotation ttl effect': 'NONE',
  'Session previous secret grace': 'NONE',
  'Session autosave rotation': 'NONE',
  'Session recovery credential in APP3': 'NONE',
  'Session origin policy': 'EXACT_ALLOWLIST',
  'Session fetch metadata policy': 'SEC_FETCH_SITE_ALLOWLIST',
  'Session credentialed cors': 'DISABLED',
  'Session absent origin on mutation': 'REJECTED',
  'Session same site sole defence': 'FORBIDDEN',
  'Session error disclosure': 'SINGLE_SAFE_SHAPE',
  'Session existence disclosure': 'NONE',
  'Session creation rate per hour': '5',
  'Session creation burst per minute': '2',
  'Session read rate per minute': '60',
  'Session authorization failure rate': '10',
  'Session authorization failure window minutes': '15',
  'Session mutation rate per minute': '30',
  'Session concurrent mutations': '1',
  'Session rate limit key': 'EPHEMERAL_NETWORK_HMAC_ROTATING_SALT',
  'Session rate limit key is identity': 'NO',
  'Session durable browser identity': 'NONE',
  'Session browser session quota': 'NONE',
  'Session raw ip persistence': 'NONE',
});

/** Cookie attributes that must be named wherever the contract is stated. */
const COOKIE_ATTRIBUTES = Object.freeze(['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']);

/**
 * Phrases the rulings must keep saying. A fact table alone is too easy to keep
 * green while the prose beside it drifts, so each of these is a named claim the
 * canonical section has to carry in its own words.
 */
const REQUIRED_RULING_CLAIMS = Object.freeze([
  [
    '32 cryptographically secure random bytes',
    /\b32\b[^.]{0,40}(CSPRNG|cryptographically secure)/i,
  ],
  ['unpadded base64url encoding', /unpadded\s+base64url/i],
  ['HMAC-SHA-256 over a runtime pepper', /HMAC-SHA-256\(\s*(server|runtime)\s+pepper/i],
  ['constant-time digest comparison', /constant[\s-]?time/i],
  ['a missing pepper fails loudly', /pepper\s+\*\*fails loudly\*\*|fails loudly/i],
  ['the exact per-session cookie name', /__Host-nettheu_ds_<session-id>/],
  ['Bearer transport of the raw secret is forbidden', /Authorization:\s*`?Bearer/i],
  ['no shared cookie for every session', /shared cookie for every session/i],
  ['no browser storage of the raw secret', /localStorage|browser storage/i],
  ['rotation is compare-and-swap', /compare[\s-]and[\s-]swap/i],
  ['rotation never extends TTL', /never\*{0,2}\s*extends? TTL|rotation \*\*never\*\* extends/i],
  ['no previous-secret grace window', /no\s+\*{0,2}previous-secret grace window/i],
  ['exactly one concurrent rotation wins', /one\*{0,2}\s+concurrent resume rotation succeeds/i],
  [
    'credentialed cross-origin CORS is disabled',
    /credentialed cross-origin CORS is \*{0,2}disabled/i,
  ],
  ['SameSite alone is not sufficient', /SameSite.{0,30}not\b.{0,20}sufficient/i],
  ['errors do not reveal session existence', /reveals? whether a session id exists/i],
  ['the rate-limit key is not identity', /not\*{0,2}\s+ownership or customer identity/i],
  ['no durable browser identity', /no durable browser identity/i],
  ['no per-browser session quota', /N active sessions per browser/i],
  ['raw IP is not persisted', /raw IP is \*{0,2}not\*{0,2} persisted/i],
]);

/** The exact locked limits, as they must appear in the security document. */
const REQUIRED_SECURITY_LIMITS = Object.freeze([
  ['session creation', /5\s*\/\s*hour/i],
  ['creation burst', /burst 2\s*\/\s*minute/i],
  ['bootstrap/resume/read', /60\s*\/\s*minute/i],
  ['authorization failures', /10\s*\/\s*15 minutes/i],
  ['authorized mutations', /30\s*\/\s*minute/i],
  ['one in-flight mutation', /1 in flight/i],
  ['ephemeral network key', /ephemeral HMAC of normalized source network data/i],
  ['rotating runtime salt', /rotating (runtime )?salt/i],
]);

/**
 * Verifies the credential, transport and abuse authority.
 *
 * @param {{rulings: string, register: string, security: string, files: Record<string, string>, fail: (m: string) => void}} input
 */
export function checkSecurityAuthority({ rulings, register, security, files, fail }) {
  checkRulingClaims(rulings, files.phase, fail);
  checkCookieContract(rulings, security, files, fail);
  checkSecurityLimits(security, files.security, fail);
  checkDecisionCarriesTransport(register, files.register, fail);
}

/** Each named claim survives in the canonical rulings section. */
function checkRulingClaims(rulings, phasePath, fail) {
  for (const [claim, pattern] of REQUIRED_RULING_CLAIMS) {
    if (!pattern.test(rulings)) {
      fail(`${phasePath}: §6.6.2 no longer states ${claim}`);
    }
  }
}

/**
 * The cookie contract is stated in full in both the rulings and the security
 * document — a contract stated in only one place is a contract that drifts.
 */
function checkCookieContract(rulings, security, files, fail) {
  for (const [label, text, path] of [
    ['§6.6.2', rulings, files.phase],
    ['§9', security, files.security],
  ]) {
    if (!text.includes(COOKIE_NAME)) {
      fail(`${path}: ${label} does not name the cookie \`${COOKIE_NAME}\``);
      continue;
    }
    for (const attribute of COOKIE_ATTRIBUTES) {
      if (!text.includes(attribute)) {
        fail(`${path}: ${label} no longer requires the cookie attribute \`${attribute}\``);
      }
    }
    // `no **`Domain`**` — markdown emphasis can sit between the two words.
    if (!/\bno\b[^A-Za-z]{0,6}Domain\b/i.test(text)) {
      fail(`${path}: ${label} no longer forbids a cookie \`Domain\` attribute`);
    }
    if (!/Max-Age.{0,40}(never )?beyond\s+`?expires_at`?/i.test(text)) {
      fail(`${path}: ${label} no longer bounds cookie \`Max-Age\` by \`expires_at\``);
    }
  }
}

/** The abuse limits are exact values, not adjectives. */
function checkSecurityLimits(security, path, fail) {
  for (const [label, pattern] of REQUIRED_SECURITY_LIMITS) {
    if (!pattern.test(security)) {
      fail(`${path}: §7 no longer records the locked limit for ${label}`);
    }
  }
}

/** The decision row itself carries the transport contract, not just a pointer. */
function checkDecisionCarriesTransport(decisionRow, path, fail) {
  for (const [label, pattern] of [
    ['the cookie name', /__Host-nettheu_ds_<session-id>/],
    ['HMAC-SHA-256', /HMAC-SHA-256/],
    ['compare-and-swap rotation', /compare[\s-]and[\s-]swap/i],
    ['no TTL extension on rotation', /never extends TTL/i],
  ]) {
    if (!pattern.test(decisionRow)) {
      fail(`${path}: the IMP-D043 row no longer records ${label}`);
    }
  }
}
