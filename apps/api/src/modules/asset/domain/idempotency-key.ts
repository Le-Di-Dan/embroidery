/**
 * `Idempotency-Key` validation and scope hashing (`APP2-B01` §7).
 *
 * The raw key never reaches the database or a log. `scope_key` stores a SHA-256
 * of `staff:{actorId}:{key}` instead, which keeps the arbiter (CST-048) exactly
 * as selective while making a stolen table dump useless for replaying someone
 * else's upload — and it binds the key to the actor, so two admins reusing the
 * same client-side key cannot collide.
 *
 * Validation is strict rather than forgiving on purpose: trimming or
 * case-folding a key would make two different client keys map to one claim,
 * which is the one thing an idempotency arbiter must never do.
 */
import { assetIntakeError } from './asset-intake.errors';
import { sha256Hex } from './canonical-json';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** ASCII letters, digits and the four punctuation characters the contract allows. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Returns the key exactly as sent, or throws `IDEMPOTENCY_KEY_INVALID`.
 *
 * The pattern excludes whitespace by construction, so no separate whitespace
 * check is needed — and nothing is normalised, so `abc ` is a rejection rather
 * than a silent alias of `abc`.
 */
export function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw assetIntakeError('IDEMPOTENCY_KEY_INVALID');
  }
  if (raw.length < MIN_IDEMPOTENCY_KEY_LENGTH || raw.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw assetIntakeError('IDEMPOTENCY_KEY_INVALID');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    throw assetIntakeError('IDEMPOTENCY_KEY_INVALID');
  }
  return raw;
}

/**
 * Builds the stored scope key.
 *
 * The join is unambiguous even though the key's charset allows `:`: the actor
 * id is a UUID and contains none, so the first two separators always delimit
 * the same three parts and no two distinct (actor, key) pairs can collide.
 */
export function buildScopeKey(actorId: string, idempotencyKey: string): string {
  return sha256Hex(`staff:${actorId}:${idempotencyKey}`);
}
