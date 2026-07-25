/**
 * Redaction primitives for structured logs (APP0-B05).
 *
 * Two independent defences: a key allowlist-style denylist that blanks the value
 * of any field whose name is sensitive regardless of its content, and a set of
 * conservative value patterns that blank credentials embedded inside otherwise
 * benign strings (an error message, a stack line). Both run before serialization
 * so a secret never reaches the sink. The patterns are deliberately anchored and
 * bounded to avoid catastrophic backtracking.
 */

/** The canonical marker written in place of any redacted value. */
export const REDACTED_MARKER = '[REDACTED]';

/**
 * Sensitive field names, stored normalised (lowercase, alphanumerics only).
 * Reconciled with the credential and verification terms used across the security
 * docs and the audit/verification schema (tokens, OTP, code hashes, grants).
 * Not assumed exhaustive — matching is normalised so casing and separators do
 * not let a variant slip through.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set(
  [
    'authorization',
    'proxyauthorization',
    'cookie',
    'setcookie',
    'password',
    'passwd',
    'pwd',
    'secret',
    'clientsecret',
    'token',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'apikey',
    'xapikey',
    'privatekey',
    'credential',
    'credentials',
    'credentialreference',
    'settoken',
    'rawtoken',
    'tokenhash',
    'otp',
    'codehash',
    'verificationcode',
    'session',
    'sessionid',
    'jwt',
    'bearer',
  ].map(normalizeKey),
);

/** Lowercases and strips every non-alphanumeric character for stable matching. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether a field name is sensitive and its value must be blanked wholesale. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

/**
 * Value patterns that blank an embedded credential inside a string.
 *
 * Each is anchored or bounded so it cannot backtrack pathologically, and each is
 * narrow enough not to destroy benign identifiers (a bare UUID, a route id, the
 * word "authorization" in prose). False-positive coverage is asserted in tests.
 */
const VALUE_PATTERNS: readonly RegExp[] = [
  // `Bearer <token>` authorization values.
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi,
  // Basic-auth credentials embedded in a URL, e.g. `://user:pass@host`.
  /:\/\/[^\s:/@]+:[^\s:/@]+@/g,
  // Password / token / secret assignments in free text, e.g. `password=hunter2`.
  /\b(?:password|passwd|pwd|token|secret|api[_-]?key)\b\s*[=:]\s*[^\s,;"'&]{3,}/gi,
  // JWT-like three-segment base64url tokens.
  /\beyJ[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{5,}\b/g,
  // PEM private-key blocks.
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
];

/** URL schemes whose `user:password@` form must be blanked (keeps benign `a:b@`). */
const CREDENTIAL_URL_SCHEME =
  /\bpostgres(?:ql)?:\/\/|redis:\/\/|amqps?:\/\/|mongodb(?:\+srv)?:\/\//i;

/**
 * Blanks any credential embedded in a string, leaving the surrounding text.
 *
 * For a value that is *only* a sensitive token the whole string collapses to the
 * marker; for a message that merely contains one, the credential is replaced in
 * place so the operational text remains useful.
 */
export function redactString(value: string): string {
  let result = value;
  for (const pattern of VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED_MARKER);
  }
  // A connection string with an inline password: blank the whole URL rather than
  // guess where it ends, since the query part may also carry credentials.
  if (CREDENTIAL_URL_SCHEME.test(result) && result.includes('@')) {
    result = result.replace(
      /\b(?:postgres(?:ql)?|redis|amqps?|mongodb(?:\+srv)?):\/\/\S*@\S*/gi,
      REDACTED_MARKER,
    );
  }
  return result;
}
