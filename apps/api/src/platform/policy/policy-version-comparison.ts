/**
 * Whether a published policy version already matches a dataset entry
 * (`APP4-B01-C1`, shared with `APP6-B01`).
 *
 * Extracted when `APP6-B01` added the second dataset publisher. It is the one
 * genuinely shared mechanic between them: both publishers read the current
 * version, compare, and append only on drift. Everything else — which dataset,
 * which keys, which reader — stays with the publisher that owns it, because a
 * generic "policy seeding framework" is the thing both checkpoints were
 * explicitly told not to build.
 *
 * The comparison is **order-insensitive**. The stored value round-tripped
 * through JSONB, so key order is not guaranteed to survive, and an
 * order-sensitive compare would republish an identical value on every boot —
 * the exact version accumulation the check exists to prevent.
 */

/** What one key's publication did. */
export type PolicyPublicationOutcome = 'published' | 'unchanged';

export interface PolicyPublicationResult {
  readonly configKey: string;
  readonly outcome: PolicyPublicationOutcome;
  readonly version: number;
}

/** The shape a dataset entry presents to the comparison. Never the whole entry. */
export interface PolicyDatasetValue {
  readonly value: Record<string, unknown>;
  readonly valueSchemaVersion: number;
}

/** The shape a stored version presents. Never the whole row. */
export interface StoredPolicyValue {
  readonly value: unknown;
  readonly valueSchemaVersion: number;
}

/**
 * `true` when the stored version needs no successor.
 *
 * A differing schema version counts as drift even if the value happens to
 * compare equal: the number states how the value is to be read, and a consumer
 * that parses by schema version must see the change.
 */
export function isPolicyValueCurrent(
  current: StoredPolicyValue,
  configuration: PolicyDatasetValue,
): boolean {
  return (
    current.valueSchemaVersion === configuration.valueSchemaVersion &&
    canonicalJson(current.value) === canonicalJson(configuration.value)
  );
}

/** A stable string for any JSON value, with object keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
