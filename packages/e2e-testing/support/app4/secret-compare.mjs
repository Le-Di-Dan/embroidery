/**
 * Secret-safe comparison and scanning primitives (APP4-E01-H02).
 *
 * E01 has to prove things *about* secrets — that a retry delivered the same
 * code, that a resend delivered a different one, that a replay copied an
 * envelope byte for byte — while never letting one reach a report, a log, an
 * assertion diff or a CI artifact.
 *
 * The rule every helper here follows: compare in memory, throw with a message
 * built only from safe field names, booleans, counts and safe ids. Nothing in
 * this module ever puts an operand in an error. That is why these exist at all —
 * `expect(a).toBe(b)` on two codes prints both the moment it fails, and a test
 * that leaks only when it breaks is the worst possible time to leak.
 *
 * Test-only.
 */

/** Thrown with a safe message; never carries an operand. */
class SecretComparisonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretComparisonError';
  }
}

/** Asserts two secrets are the same value, reporting only the boolean. */
export function assertSecretEqual(left, right, label) {
  const equal = left === right;
  if (!equal) {
    throw new SecretComparisonError(`${label}: expected equal = true, observed equal = false`);
  }
  return true;
}

/** Asserts two secrets differ, reporting only the boolean. */
export function assertSecretDifferent(left, right, label) {
  const different = left !== right;
  if (!different) {
    throw new SecretComparisonError(
      `${label}: expected different = true, observed different = false`,
    );
  }
  return true;
}

/**
 * Compares selected fields of two snapshots and reports per-field booleans.
 *
 * Used for the envelope equality `E01-13` requires (`version`, `algorithm`,
 * `iv`, `ciphertext`, `authTag`, `payload_schema_version`). Inputs are expected
 * to be fingerprints — see `db-evidence.envelopeFingerprint` — so even this
 * module never holds the ciphertext it is proving equal.
 */
export function compareFields(left = {}, right = {}, fields) {
  const result = {};
  for (const field of fields) {
    result[field] = left[field] === right[field];
  }
  return result;
}

/** Asserts every named field matched, naming only the fields that did not. */
export function assertByteFieldsEqual(left, right, fields, label) {
  const comparison = compareFields(left, right, fields);
  const mismatched = Object.entries(comparison)
    .filter(([, equal]) => !equal)
    .map(([field]) => field);
  if (mismatched.length > 0) {
    throw new SecretComparisonError(
      `${label}: ${mismatched.length} field(s) differ — ${mismatched.join(', ')}`,
    );
  }
  return comparison;
}

/**
 * Asserts a secret appears in none of the supplied texts.
 *
 * `texts` is a map of surface name → text, so a failure can name the surface
 * that leaked without reproducing the match. Used for the log/persistence scan.
 */
export function assertAbsentFromText(secret, texts) {
  const surfaces = Object.entries(texts)
    .filter(([, text]) => typeof text === 'string' && text.includes(secret))
    .map(([surface]) => surface);
  if (surfaces.length > 0) {
    throw new SecretComparisonError(
      `secretPresent = true on ${surfaces.length} surface(s): ${surfaces.join(', ')}`,
    );
  }
  return { present: false, surfaces: [] };
}

/** Non-throwing form: reports presence and the surface names only. */
export function scanTextsForSecret(secret, texts) {
  const surfaces = Object.entries(texts)
    .filter(([, text]) => typeof text === 'string' && text.includes(secret))
    .map(([surface]) => surface);
  return { present: surfaces.length > 0, surfaces };
}
