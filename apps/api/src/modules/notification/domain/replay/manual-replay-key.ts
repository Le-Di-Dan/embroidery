/**
 * The deterministic Admin manual-replay intent key (`APP4-B08`, IMP-D049
 * PO-11).
 *
 * The locked canonical input is:
 *
 * ```text
 * app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>
 * ```
 *
 * hashed with SHA-256 and rendered as lowercase hex. That is authority, not a
 * choice this file makes, and it is restated here rather than imported from
 * `notification-intent-key.ts` for the same reason that file keeps its own
 * prefix: the two keys live in one unique column (`CST-047`), and sharing a
 * derivation would let a change to the business tuple silently move every replay
 * key too.
 *
 * ### Why exactly these two components and nothing else
 *
 * The key **is** the idempotency of manual replay: two Admins clicking the same
 * button, or one Admin clicking twice, must collapse onto one intent through the
 * existing `intent_key` uniqueness — with no new idempotency table and no
 * in-memory lock. So the input must name the *decision*, and a decision is
 * exactly "replay this terminal delivery of this failed intent".
 *
 * Every plausible extra component would break that, and each is worth naming
 * because each looks harmless:
 *
 * - **the Admin id** — two operators handling the same ticket would produce two
 *   deliveries, which is the precise bug idempotency exists to prevent;
 * - **a timestamp** — a second click a minute later would be a second delivery;
 * - **the request id** — every call is its own request, so the key would be
 *   unique per call, i.e. no key at all;
 * - **a random nonce** — the same, deliberately;
 * - **the attempt count** — it is worker state, not part of the decision;
 * - **the recipient** — `intent_key` is a persisted column, and putting a
 *   destination in it would make the dedup key a contact database (the rule
 *   `notification-intent-key.ts` records);
 * - **the ciphertext** — obtaining it would mean reading the envelope, and the
 *   API must never have a reason to open one.
 *
 * ### Neither component is a secret
 *
 * Both are server-generated identifiers already visible to any authenticated
 * operator: the intent id is in the Admin list, and the outbox event id is
 * resolved from the non-secret REL-104 linkage. The digest is not a credential
 * and is not compared in constant time, because there is nothing to guess — it
 * is a deduplication key, not an authenticator. This is the one legitimate
 * SHA-256 in the B08 path and it must not be confused with the peppered HMAC
 * that digests a real secret (`ADR-APP4-001` §5).
 */
import { createHash } from 'node:crypto';

/** Versioned so a future input change cannot collide with a key already stored. */
const KEY_PREFIX = 'app4-manual-replay:v1';

export interface ManualReplayKeyInput {
  /** The terminal FAILED intent an operator asked to replay. */
  readonly originNotificationIntentId: string;
  /** The DEAD_LETTER delivery event whose sealed envelope is copied forward. */
  readonly deadLetterOutboxEventId: bigint;
}

/**
 * The canonical string the digest is taken over. Exported for its tests.
 *
 * The components are joined raw rather than percent-encoded, unlike the business
 * intent key: both are server-generated identifiers — a UUID and a decimal
 * integer — and neither can contain the `:` delimiter, so the injectivity that
 * encoding buys there is already structural here. The locked authority states
 * this exact literal form, so encoding it would produce a different key than the
 * one IMP-D049 PO-11 specifies.
 */
export function canonicalManualReplayKeyInput(input: ManualReplayKeyInput): string {
  return `${KEY_PREFIX}:${input.originNotificationIntentId}:${input.deadLetterOutboxEventId.toString()}`;
}

export function deriveManualReplayIntentKey(input: ManualReplayKeyInput): string {
  return createHash('sha256').update(canonicalManualReplayKeyInput(input), 'utf8').digest('hex');
}
