/**
 * The `NotificationRequest` contract (`APP4-B01`, `ADR-APP4-001` §6, §7).
 *
 * One typed input that both future callers can express without the notification
 * module importing a customer or grant repository: `APP4-B03` asks for a
 * verification code to be delivered, `APP4-B05` for a secure link, and neither
 * needs a second intake path.
 *
 * The division of labour is deliberate. **The caller owns the business secret**
 * — it mints the code or token, hashes it into its own table and passes the
 * plaintext here exactly once. **B01 owns intent idempotency, redacted
 * persistence, masking, sealing and the outbox append.** B01 never generates a
 * secret, which is why `issueVerificationCode` and `issueSecureLinkToken` are
 * nowhere in this module.
 */
import type { ContactKind } from '@embroidery/database';
import type { DeliverySecretKind } from '@embroidery/notification-delivery';

import type { IntentId } from './repositories/notification-intent.repository';

/**
 * The typed business reference an intent may carry.
 *
 * A closed discriminated union rather than an open record, so
 * `notification_intents.params` is secret-free **by construction**: there is no
 * field a code, token, ciphertext or rendered body could occupy, and no
 * reviewer has to check that a caller did not add one.
 */
export type NotificationReference =
  | { readonly kind: 'VERIFICATION_CHALLENGE'; readonly challengeId: string }
  | { readonly kind: 'SECURE_ACCESS_GRANT'; readonly grantId: string };

/** The version stamped into `params`, so a later shape change is detectable. */
export const NOTIFICATION_PARAMS_VERSION = 1;

export interface NotificationRequest {
  /**
   * The business event this delivery reacts to — a challenge issuance, a grant
   * issuance. Part of the idempotency tuple, so re-handling the same event
   * cannot produce a second notification.
   */
  readonly sourceEventId: string;
  readonly channel: string;
  readonly contactKind: ContactKind;
  /** The real destination. Masked for storage; sealed for delivery. */
  readonly normalizedRecipient: string;
  /**
   * The Customer contact point this notification was addressed to, when the
   * caller resolved one (`APP4-A01-C1`).
   *
   * **Ownership metadata, not a secret and not a destination.** It names a row
   * the caller already chose; it does not select one. B01 still delivers to
   * `normalizedRecipient` and would not read this field even if the two
   * disagreed — resolving a contact point to an address here would make this
   * module a second delivery-target authority, and it imports no customer
   * repository precisely so it cannot become one.
   *
   * It exists because a notification with no owner cannot be found again. The
   * `APP4-B08` Customer filter joins through this column, so an intent that
   * omits it is invisible to the support screen that would otherwise explain
   * why a customer never received their link.
   *
   * **Optional, and legitimately absent.** A verification code sent *before* a
   * Customer exists has no contact point to name, and inventing one — or
   * creating a Customer to have one — would be worse than the gap. Absent is a
   * truthful answer.
   */
  readonly recipientContactPointId?: string | undefined;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly reference: NotificationReference;
  readonly secretKind: DeliverySecretKind;
  /** The one raw code or token. Never persisted, never logged by this module. */
  readonly secret: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** Falls back to the active request id when omitted. */
  readonly correlationId?: string | undefined;
}

/**
 * What the caller learns.
 *
 * `replay` is a success, not an error: a duplicate request found the intent that
 * already exists, and deliberately sealed nothing and appended nothing.
 */
export type NotificationRequestResult =
  | {
      readonly outcome: 'created';
      readonly intentId: IntentId;
      readonly intentKey: string;
      readonly outboxEventId: bigint;
    }
  | { readonly outcome: 'replay'; readonly intentId: IntentId; readonly intentKey: string };

/** Builds the redacted `params`. The only shape this module ever persists. */
export function buildIntentParams(reference: NotificationReference): Record<string, unknown> {
  return {
    schemaVersion: NOTIFICATION_PARAMS_VERSION,
    reference:
      reference.kind === 'VERIFICATION_CHALLENGE'
        ? { kind: reference.kind, challengeId: reference.challengeId }
        : { kind: reference.kind, grantId: reference.grantId },
  };
}
