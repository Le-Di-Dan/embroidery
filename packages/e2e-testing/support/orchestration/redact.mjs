/**
 * Redaction helpers for orchestrator logs and runtime state.
 *
 * Connection strings, tokens and credentials must never reach a log line, the
 * runtime state file, or a Playwright artifact. These helpers are the single
 * choke point.
 */

/** Replaces user/password in a URL; returns a stable placeholder if unparseable. */
export function redactUrl(value) {
  if (typeof value !== 'string' || value === '') {
    return '[redacted-url]';
  }
  try {
    const url = new URL(value);
    if (url.username) {
      url.username = '***';
    }
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '[redacted-url]';
  }
}

const SECRET_KEY = /(password|passwd|secret|token|authorization|cookie|api[_-]?key)/i;

/** Shallowly redacts secret-like keys and any embedded connection strings. */
export function redactRecord(record) {
  const out = {};
  for (const [key, raw] of Object.entries(record ?? {})) {
    if (SECRET_KEY.test(key)) {
      out[key] = '***';
    } else if (typeof raw === 'string' && raw.includes('://') && /:.*@/.test(raw)) {
      out[key] = redactUrl(raw);
    } else {
      out[key] = raw;
    }
  }
  return out;
}
