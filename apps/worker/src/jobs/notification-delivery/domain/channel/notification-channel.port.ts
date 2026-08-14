/**
 * The provider-neutral outbound boundary (`APP4-W01`, `ADR-APP4-001` §12).
 *
 * APP4 selects no SMTP vendor, email SaaS, SMS vendor, sender identity or
 * production credential (`IMP-O006` / `APP4-PO-001` stays open). This port is
 * what makes that deferral survivable: the delivery use case is written against
 * six plain fields and a two-state result, so choosing a provider later is
 * adding an adapter, not rewriting a lifecycle.
 *
 * It therefore depends on **nothing**: no provider SDK type, no HTTP DTO, no
 * persistence row, no Nest decorator, and no APP5/APP6/APP7 business object. The
 * moment a provider's own type appears in this signature, the neutrality is
 * gone and every caller inherits the vendor.
 *
 * `secret` is plaintext. It exists in the argument to this call and in the
 * adapter's own outbound message, and nowhere else (§6.6) — an implementation
 * that logs, caches, echoes or persists it violates the envelope's entire
 * reason for existing.
 */

/** The two channels the contact-kind mapping produces: EMAIL → EMAIL, PHONE → SMS. */
export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

/**
 * One delivery, fully described.
 *
 * `secretKind` travels because a channel adapter legitimately renders a code and
 * a link differently; it is a discriminator, never a second copy of the secret.
 */
export interface NotificationDelivery {
  readonly channel: NotificationChannel;
  readonly normalizedRecipient: string;
  readonly secretKind: string;
  readonly secret: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/**
 * What a transport reports back.
 *
 * The failure axis is `retryable`, decided by the adapter, because only the
 * adapter knows whether its transport's refusal was about this message or about
 * the moment. It is deliberately not an error object: an exception carries a
 * provider message, and a provider message is a PII sink.
 */
export type DeliveryResult =
  | {
      readonly outcome: 'SENT';
      /** An opaque provider reference, if the transport gives one. Never a body. */
      readonly providerMessageRef?: string | undefined;
    }
  | { readonly outcome: 'FAILED'; readonly retryable: boolean };

export interface NotificationChannelPort {
  send(delivery: NotificationDelivery): Promise<DeliveryResult>;
}

export const NOTIFICATION_CHANNEL_PORT = Symbol('NOTIFICATION_CHANNEL_PORT');
