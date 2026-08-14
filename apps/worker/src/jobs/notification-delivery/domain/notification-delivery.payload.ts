/**
 * The `notification.delivery.requested` payload contract (`APP4-W01`).
 *
 * The payload **is** the sealed envelope. There is nothing else in it, and that
 * is the point: everything a delivery needs beyond the ciphertext travels in the
 * outbox row's non-secret columns (`ADR-APP4-001` §7), so validation here can
 * only ever be structural.
 *
 * Structure is checked through the shared package's own predicate rather than a
 * local copy. A second opinion about what a well-formed envelope looks like is
 * exactly how a producer and a consumer drift, and the version constant lives in
 * one place for the same reason — this handler declares
 * `payloadSchemaVersion = DELIVERY_ENVELOPE_VERSION`, so a row sealed under a
 * version this build cannot read is rejected by the runtime before any key is
 * touched.
 *
 * Nothing here decrypts, and nothing here may: opening happens after the claim
 * succeeds and after the current intent is known.
 */
import {
  DELIVERY_ENVELOPE_VERSION,
  isDeliveryEnvelope,
  type DeliveryEnvelope,
} from '@embroidery/notification-delivery';

import type { PayloadValidationResult } from '../../../runtime/registry/job-handler';

/** The one event type `APP4-B01` appends and this handler consumes. */
export const NOTIFICATION_DELIVERY_EVENT_TYPE = 'notification.delivery.requested';

/** The payload schema version is the envelope version. One constant, one owner. */
export const NOTIFICATION_DELIVERY_PAYLOAD_VERSION = DELIVERY_ENVELOPE_VERSION;

/** The aggregate kind the linkage must carry (`ADR-APP4-001` §7). */
export const NOTIFICATION_INTENT_AGGREGATE_KIND = 'NOTIFICATION_INTENT';

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'notification-delivery:v1:';

export function parseNotificationDeliveryPayload(
  payload: unknown,
): PayloadValidationResult<DeliveryEnvelope> {
  if (!isDeliveryEnvelope(payload)) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  if (payload.version !== NOTIFICATION_DELIVERY_PAYLOAD_VERSION) {
    // Well formed and still unreadable by this build: the producer is ahead of
    // the consumer, which is what `JOB_SCHEMA_UNSUPPORTED` means and why it is
    // terminal rather than retried forever against a key that cannot help.
    return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
  }
  return { valid: true, payload };
}

/**
 * The durable effect's identity.
 *
 * The outbox event id, never the ciphertext: an `APP4-B08` replay copies the
 * envelope byte-identically into a **new** event, and keying the effect off the
 * bytes would make the replay look like a repeat of the original delivery it
 * exists to supersede.
 */
export function deriveNotificationDeliveryEffectKey(outboxEventId: bigint): string {
  return `${EFFECT_KEY_PREFIX}${outboxEventId.toString()}`;
}
