/**
 * The optional delivery half of a grant issuance (`APP4-B05` §12).
 *
 * ### The recipient is resolved, never accepted
 *
 * This class takes a **customer id** and finds the destination itself, from that
 * customer's own verified contact points. It has no parameter a caller could put
 * an address into, which is the structural form of the §12 rule: B05 must not
 * become "send a token to an arbitrary raw address". A caller holding a grant
 * target cannot redirect the link that grants it.
 *
 * The chosen target is the customer's **primary verified** contact, and a
 * deactivated one is never eligible. When no such contact exists the issuance
 * refuses rather than falling back to any verified contact: which channel a
 * customer considers theirs is a decision `customer_contact_points.is_primary`
 * already records, and picking a different one here would deliver a credential
 * to a channel they did not designate.
 *
 * ### The secret passes through and is not kept
 *
 * The raw token arrives as an argument, travels into one `RequestNotificationUseCase`
 * call, and is never assigned to a field, logged, or returned. B01 owns intent
 * idempotency, masking, sealing and the outbox append; B05 owns the secret and
 * hands it over exactly once. `sealDeliveryEnvelope` is deliberately not
 * imported — one application seam seals, and this is not it.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind } from '@embroidery/database';

import { RequestNotificationUseCase } from '../../notification/application/request-notification.use-case';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import type { GrantId } from '../domain/repositories/secure-access-grant.repository';
import { SecureGrantError } from '../domain/grant/secure-grant-outcome';

/**
 * The notification template this capability asks B01 to deliver.
 *
 * A key, not a body: `notification_intents` stores a template reference and
 * redacted parameters, and rendering belongs to the outbound boundary
 * (`ADR-DB2-003`). Versioned so a later revision is a different idempotency
 * tuple rather than a silent change of meaning.
 */
export const SECURE_LINK_TEMPLATE_KEY = 'secure_access.link';
export const SECURE_LINK_TEMPLATE_VERSION = 1;

/** The contact-kind → channel mapping (`ADR-APP4-001` §12). Read, never inferred. */
const CHANNEL_OF: Readonly<Record<ContactKind, string>> = { EMAIL: 'EMAIL', PHONE: 'SMS' };

export interface NotifyGrantInput {
  readonly grantId: GrantId;
  readonly customerId: CustomerId;
  /** The one raw token. Never persisted, never logged, never held by this class. */
  readonly rawToken: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

@Injectable()
export class SecureGrantNotifier {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly notifications: RequestNotificationUseCase,
  ) {}

  /**
   * Hands one secure link to B01, inside the caller's transaction.
   *
   * Opens no transaction of its own: the grant write has already happened in the
   * enclosing one, and a nested boundary here would let the intent commit while
   * the grant rolled back — or the reverse, which is a grant nobody can reach.
   *
   * @requiresTransaction
   */
  async notify(input: NotifyGrantInput): Promise<void> {
    const target = await this.resolveTarget(input.customerId);

    await this.notifications.request({
      // Deterministic and tied to the new grant id. A replayed handling of one
      // issuance collapses onto one intent, while a reissue — a different grant
      // — is genuinely a different notification, which is exactly the
      // distinction `ADR-APP4-001` PO-10 draws between transport retry and
      // business reissue.
      sourceEventId: `secure_grant.issued:${input.grantId}`,
      channel: CHANNEL_OF[target.contactKind],
      contactKind: target.contactKind,
      normalizedRecipient: target.normalizedValue,
      templateKey: SECURE_LINK_TEMPLATE_KEY,
      templateVersion: SECURE_LINK_TEMPLATE_VERSION,
      // The closed reference union carries the grant id and nothing else, so
      // `notification_intents.params` is token-free by construction.
      reference: { kind: 'SECURE_ACCESS_GRANT', grantId: input.grantId },
      secretKind: 'SECURE_LINK_TOKEN',
      secret: input.rawToken,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
  }

  /** The customer's primary, verified, live contact — or a bounded refusal. */
  private async resolveTarget(customerId: CustomerId): Promise<ContactPoint> {
    const contacts = await this.customers.listContactPoints(customerId);
    const target = contacts.find(
      (contact) =>
        contact.isPrimary &&
        contact.verifiedAt !== undefined &&
        contact.deactivatedAt === undefined,
    );
    if (target === undefined) {
      throw new SecureGrantError('GRANT_DELIVERY_TARGET_UNAVAILABLE');
    }
    return target;
  }
}
