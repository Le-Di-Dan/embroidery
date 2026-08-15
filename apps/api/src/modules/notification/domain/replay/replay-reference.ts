/**
 * Reading the typed business reference back out of a stored intent
 * (`APP4-B08` §18–§20).
 *
 * `APP4-B01` writes `notification_intents.params` from a closed discriminated
 * union — `buildIntentParams` can emit a challenge id or a grant id and nothing
 * else — so the column is secret-free by construction. This is the inverse
 * function, and it is the **only** way B08 learns which business object a
 * delivery was for.
 *
 * ### The alternatives are all worse, and all tempting
 *
 * - **Open the envelope.** The ciphertext carries `secretKind`, so decrypting
 *   would answer the question directly. It would also put a plaintext code or
 *   token in the API process for the duration of an Admin support call, which
 *   `ADR-APP4-001` §7 forbids outright: the API seals and never opens.
 * - **Infer from `templateKey`.** A string comparison against a template name
 *   would make a copy-edit to a template silently change which table B08 checks
 *   eligibility against.
 * - **Try every table until one matches.** An id that happens to exist in the
 *   wrong table would pass the wrong eligibility rule, and the lookup itself
 *   would be an existence oracle across two aggregates.
 *
 * So the reference is read from the field that was designed to carry it, and
 * anything that does not match the contract is refused rather than guessed at.
 *
 * ### Failure is closed, and is not `REISSUE_REQUIRED`
 *
 * A `params` object that does not satisfy the B01 contract means persistence is
 * malformed — a row from a future schema version, or one written by something
 * that bypassed `buildIntentParams`. That is not "the secret expired", so it
 * must not route the operator to a business resend. It returns `undefined` here
 * and the caller raises a bounded internal refusal (§20).
 */
import { NOTIFICATION_PARAMS_VERSION, type NotificationReference } from '../notification-request';

/** The reference kinds `buildIntentParams` can have written. */
const REFERENCE_KINDS = ['VERIFICATION_CHALLENGE', 'SECURE_ACCESS_GRANT'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * Parses the stored `params` back into the typed reference, or `undefined`.
 *
 * The `schemaVersion` is checked, not ignored: `params` is a versioned JSONB
 * boundary, and a future version could move the reference or change what its
 * fields mean. Reading a version this code does not understand and proceeding
 * anyway is how a replay would be decided against a field that no longer means
 * what it did.
 */
export function readNotificationReference(
  params: Record<string, unknown>,
): NotificationReference | undefined {
  if (params['schemaVersion'] !== NOTIFICATION_PARAMS_VERSION) {
    return undefined;
  }

  const reference = params['reference'];
  if (!isRecord(reference)) {
    return undefined;
  }

  const kind = reference['kind'];
  if (typeof kind !== 'string' || !(REFERENCE_KINDS as readonly string[]).includes(kind)) {
    return undefined;
  }

  if (kind === 'VERIFICATION_CHALLENGE') {
    const challengeId = nonEmptyString(reference['challengeId']);
    return challengeId === undefined ? undefined : { kind, challengeId };
  }

  const grantId = nonEmptyString(reference['grantId']);
  return grantId === undefined ? undefined : { kind: 'SECURE_ACCESS_GRANT', grantId };
}
