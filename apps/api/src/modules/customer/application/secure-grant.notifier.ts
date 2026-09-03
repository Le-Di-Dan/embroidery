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
 * ### The landing is read from the grant, never accepted (`APP12-S03-C1`)
 *
 * The same rule, applied a second time. There are two grant scopes and two
 * Storefront surfaces, and each surface refuses the other scope's token — so
 * *where* a link points is an authorization fact, not a formatting choice. This
 * class therefore re-reads the grant it was handed and takes `scope_kind` from
 * the persisted row, in the caller's own transaction, rather than accepting a
 * scope parameter. A caller holding a grant id cannot say where its link lands,
 * for the same reason it cannot say who receives it.
 *
 * The read is not redundant with the issuer's own literal. The issuer knows what
 * it *asked* the database to write; this reads what the database actually holds,
 * which is the value every later authorization decision — the public resolver,
 * the surface's scope guard — will be made against. If those two could ever
 * disagree, the link must follow the row.
 *
 * An unknown `scope_kind` refuses the delivery. It cannot arise from the two
 * issuers, but `scope_kind` is a text column and this is the one place where
 * guessing would produce a link that looks right and opens nothing.
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
import type { ContactKind, GrantScopeKind } from '@embroidery/database';
import type { SecureLinkLanding } from '@embroidery/notification-delivery';

import { RequestNotificationUseCase } from '../../notification/application/request-notification.use-case';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type GrantId,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
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

/**
 * The grant scope → secure-link landing mapping (`APP12-S03-C1`).
 *
 * Exhaustive over `GrantScopeKind`, so a third scope cannot be added anywhere
 * in the repository without this file failing to compile until someone decides
 * where its links land. The two vocabularies are kept distinct — a grant scope
 * is an authorization fact and a landing is a delivery destination — even though
 * today they read alike, because the alternative is a cast that would let any
 * future divergence pass unnoticed.
 *
 * No path appears here. Which URL a landing becomes is the worker's closed
 * table, and this module composes no URLs at all.
 */
const LANDING_OF: Readonly<Record<GrantScopeKind, SecureLinkLanding>> = {
  REQUEST_ACCESS: 'REQUEST_ACCESS',
  ORDER_ACCESS: 'ORDER_ACCESS',
};

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
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
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
    const landing = await this.resolveLanding(input.grantId);

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
      // The same contact point `resolveTarget` just chose, named by its
      // persisted id (`APP4-A01-C1`). It comes from the customer's own record,
      // like the address beside it — there is still no parameter through which a
      // caller could supply either, so this adds no way to redirect a link.
      //
      // Without it the intent has no owner, and `APP4-B08`'s Customer filter —
      // which joins through this column and refuses to guess from the masked
      // recipient — cannot show support the delivery that failed.
      recipientContactPointId: target.id,
      templateKey: SECURE_LINK_TEMPLATE_KEY,
      templateVersion: SECURE_LINK_TEMPLATE_VERSION,
      // The closed reference union carries the grant id and nothing else, so
      // `notification_intents.params` is token-free by construction.
      reference: { kind: 'SECURE_ACCESS_GRANT', grantId: input.grantId },
      secretKind: 'SECURE_LINK_TOKEN',
      // Sealed with the token, so the worker can route the link without asking
      // any grant table what it is carrying. Resolved above from the persisted
      // row, never from this call's arguments.
      secureLinkLanding: landing,
      secret: input.rawToken,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
  }

  /**
   * The landing this grant's scope opens, from the grant row itself.
   *
   * Reads inside the caller's transaction, where the row the issuer has just
   * written is already visible. A missing grant is the same refusal as an
   * unroutable scope: both mean this delivery cannot be addressed, and neither
   * says anything a caller could probe with.
   */
  private async resolveLanding(grantId: GrantId): Promise<SecureLinkLanding> {
    const grant = await this.grants.findById(grantId);
    const landing = grant === undefined ? undefined : LANDING_OF[grant.scopeKind];
    if (landing === undefined) {
      throw new SecureGrantError('GRANT_DELIVERY_TARGET_UNAVAILABLE');
    }
    return landing;
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
