/**
 * The deterministic notification intent key (`APP4-B01`).
 *
 * The locked idempotency tuple is **source business event + normalized
 * recipient + template identity**. Two requests describing the same decision
 * produce the same key and collapse through `createIdempotent`; any difference
 * in the tuple produces a different key and a genuinely separate notification.
 *
 * Two properties are load-bearing:
 *
 * - **The recipient never appears raw.** `intent_key` is a persisted column, and
 *   putting an email address in it would make the dedup key itself a contact
 *   database — precisely what `recipient_masked` exists to avoid. Hashing the
 *   whole canonical tuple keeps the key opaque while staying deterministic.
 * - **The encoding is injective.** Each component is percent-encoded before it
 *   is joined, so a delimiter appearing inside a value cannot make two different
 *   tuples canonicalize to the same string — the collision that would silently
 *   suppress a real second notification.
 *
 * No secret enters the key and there is no random component: a key derived with
 * any randomness would defeat the deduplication it exists for.
 */
import { createHash } from 'node:crypto';

/** Versioned so a future tuple change cannot silently collide with this one. */
const KEY_PREFIX = 'app4-notification:v1';

export interface NotificationIntentKeyInput {
  readonly sourceEventId: string;
  readonly normalizedRecipient: string;
  readonly templateKey: string;
  readonly templateVersion: number;
}

/** The canonical string the digest is taken over. Exported for its tests. */
export function canonicalIntentKeyInput(input: NotificationIntentKeyInput): string {
  return [
    KEY_PREFIX,
    encodeURIComponent(input.sourceEventId),
    encodeURIComponent(input.normalizedRecipient),
    encodeURIComponent(input.templateKey),
    encodeURIComponent(String(input.templateVersion)),
  ].join(':');
}

export function deriveNotificationIntentKey(input: NotificationIntentKeyInput): string {
  return createHash('sha256').update(canonicalIntentKeyInput(input), 'utf8').digest('hex');
}
