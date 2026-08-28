/**
 * The three Admin support reads (`APP4-B07`).
 *
 * `APP4_PHASE_ENTRY_AUDIT` B07 fixes what an operator may answer: *is this
 * Customer verified, which of their contacts are current and which is primary,
 * and which grants exist or are still potentially live*. This class answers
 * exactly those and holds no capability beyond them — no write, no merge, no
 * anonymization, no notification and no APP5 content.
 *
 * A third read joins them under the Product Owner's A01 authority ruling:
 * {@link AdminCustomerSupportQuery.resolveByContact}, which turns one exact
 * verified contact into the Customer id the other two are addressed by. It is a
 * *lookup*, not the search this class still refuses — one whole normalized
 * value, one row or none, no list and no partial match. The distinction is
 * argued where the method is defined.
 *
 * ### It is a read, and it stays one
 *
 * Neither method opens a transaction, appends an audit event or touches a
 * lifecycle. Reading a customer's record is not a business action, and a read
 * that wrote evidence would fill `audit_events` — which outlives its subject by
 * design (G-DB7-46) — with operator page views. `ADR-DB3-004` r11 audits
 * *issue, use-for-sensitive-action, revoke, reissue and step-up*, and a support
 * read is none of them.
 *
 * ### The masked value is the only contact representation
 *
 * `normalizedValue` and `displayValue` both reach this class from the
 * repository, and neither leaves it. The projection below is the single place
 * where a contact becomes presentable, it calls `APP4-P01`'s `maskContact` and
 * there is no branch that skips it. Nothing here logs a contact in any form.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind } from '@embroidery/database';

import { maskContact } from '../domain/contact/mask-contact';
import { normalizeEmail } from '../domain/contact/normalize-email';
import { normalizePhone } from '../domain/contact/normalize-phone';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
  type SecureAccessGrantSummary,
} from '../domain/repositories/secure-access-grant.repository';
import { AdminSupportError } from '../domain/support/admin-support.errors';

/** One current contact, as an operator may see it. */
export interface AdminContactView {
  /**
   * The opaque `customer_contact_points.id` (`APP10-B01`).
   *
   * B07 deliberately published none, because it had no per-contact operation
   * for one to address. B01 delivers two, so the id now names something real.
   * It is not derived from the contact value and cannot be turned into one.
   */
  readonly contactPointId: string;
  readonly kind: ContactKind;
  /** `APP4-P01`'s deterministic mask. Never the normalized or display value. */
  readonly maskedValue: string;
  readonly verified: boolean;
  readonly primary: boolean;
}

export interface AdminCustomerDetailView {
  readonly customerId: string;
  /** The Customer's own name, when they supplied one. Never a Business Profile. */
  readonly displayName: string | undefined;
  /** The operator's internal note (`APP10-B01`). Staff-facing, never notified. */
  readonly notes: string | undefined;
  /** When this identity came into existence. A Customer exists only verified. */
  readonly verifiedAt: Date;
  readonly contacts: readonly AdminContactView[];
}

export type AdminGrantView = SecureAccessGrantSummary;

@Injectable()
export class AdminCustomerSupportQuery {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grantRepository: SecureAccessGrantRepository,
  ) {}

  /**
   * The support projection for one Customer.
   *
   * `verifiedAt` is published because a Customer's *existence* is the
   * verification fact: `ADR-DB2-001` r5 admits no unverified customer, so the
   * column is NOT NULL and its presence is the answer to "is this Customer
   * verified?". There is no separate boolean, because a boolean that is always
   * `true` documents nothing and invites a future writer to make it meaningful
   * by inventing an unverified state the model forbids.
   *
   * `displayName` is published under the Product Owner's A01 authority ruling:
   * it is on every approved Customer card because an operator has to confirm
   * they are looking at the right person before killing their access. It is read
   * from the Customer record this method already loaded — no second query, no
   * Business Profile join, no fallback to a contact value when it is absent.
   *
   * Deliberately absent: `mergedIntoCustomerId` and `anonymizedAt` — merge
   * history and anonymization are named out of scope; the Business Profile —
   * likewise; and every credential, session, challenge and grant secret, which
   * have no projection anywhere in this phase.
   */
  async detail(customerId: CustomerId): Promise<AdminCustomerDetailView> {
    const customer = await this.customers.findById(customerId);
    if (customer === undefined) {
      throw new AdminSupportError('CUSTOMER_NOT_FOUND');
    }

    const contacts = await this.customers.listContactPoints(customerId);
    return {
      customerId: customer.id,
      displayName: customer.displayName,
      notes: customer.notes,
      verifiedAt: customer.verifiedAt,
      contacts: contacts.filter(isCurrent).sort(byPrimaryThenKind).map(toContactView),
    };
  }

  /**
   * The exact-contact resolver (Product Owner authority unblock, A01).
   *
   * The support screen's entry point: an operator has an email or a phone from a
   * ticket, and needs the id the two reads above are addressed by. It answers
   * with that id or with nothing.
   *
   * ### It is a lookup, not a search
   *
   * The submitted value is normalized by `APP4-P01` — the same
   * `normalizeEmail`/`normalizePhone` the public verification flow uses, called
   * here rather than reimplemented, because a second normalizer would mean an
   * operator and a customer could type the same address and reach different
   * rows. The normalized form is then matched **whole** by
   * `findByVerifiedContact`, which is an equality lookup on the
   * `(kind, normalized_value)` uniqueness arbiter. There is no `LIKE`, no
   * prefix, no trigram, no similarity and no result list anywhere on this path,
   * and the repository method it calls is the one the returning-customer
   * identity flow already uses.
   *
   * ### Three different misses, one answer
   *
   * An unknown contact, an unverified one and a deactivated one are all
   * `CONTACT_NOT_RESOLVED`. `findByVerifiedContact` matches only rows that are
   * verified and current, so the other two never reach a branch here that could
   * distinguish them — and that is the design, not an accident of it.
   * Distinguishing them would answer *does this address exist in the system*,
   * which is the enumeration question `ADR-APP4-001` §3 refuses even for an
   * authenticated operator: staff eyes are not a reason to build an oracle.
   *
   * A malformed contact is the same answer for the same reason. It is tempting
   * to report a shape error, but a caller who learns that `a@b` is malformed and
   * `a@b.com` is merely unknown has been told something about the second value.
   * The normalizer's rejection reason therefore stops here.
   *
   * ### Nothing is written and nothing is logged
   *
   * No transaction, no audit event — a support read is not one of the five
   * audited grant actions (`ADR-DB3-004` r11) — and the raw and normalized
   * values never leave this method. They are arguments and locals; nothing
   * returns them, stores them or passes them to a logger.
   */
  async resolveByContact(kind: ContactKind, rawContact: string): Promise<CustomerId> {
    const normalization =
      kind === 'EMAIL' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    if (!normalization.ok) {
      throw new AdminSupportError('CONTACT_NOT_RESOLVED');
    }

    const customer = await this.customers.findByVerifiedContact(
      kind,
      normalization.contact.normalized,
    );
    if (customer === undefined) {
      throw new AdminSupportError('CONTACT_NOT_RESOLVED');
    }
    return customer.id;
  }

  /**
   * Every grant belonging to one Customer, whatever its state.
   *
   * Refuses an unknown Customer rather than answering with an empty list. The
   * two are different facts — "this Customer has never had a link" and "there is
   * no such Customer" — and an operator chasing a support ticket acts
   * differently on each. The read costs one indexed primary-key lookup.
   */
  async grants(customerId: CustomerId): Promise<readonly AdminGrantView[]> {
    const customer = await this.customers.findById(customerId);
    if (customer === undefined) {
      throw new AdminSupportError('CUSTOMER_NOT_FOUND');
    }
    return this.grantRepository.listForCustomer(customerId);
  }
}

/**
 * Current contacts only.
 *
 * B07 is minimum current support, not a history browser: `ADR-DB2-003` r7
 * forbids a customer-facing contact history, and the phase audit's stop
 * condition for this checkpoint is support needing one. `listContactPoints`
 * returns deactivated rows too — it is the repository's general read, shared
 * with the identity flow that has to see them — so the narrowing happens here,
 * in the one caller that publishes them, rather than by adding a filtered query
 * that would make history a supported request shape.
 */
function isCurrent(contact: ContactPoint): boolean {
  return contact.deactivatedAt === undefined;
}

/**
 * Primary first, then by kind, then by mask.
 *
 * A deterministic order, so two identical requests render an operator's table
 * the same way. `listContactPoints` promises none, and "the primary one is at
 * the top" is the reading order the question implies.
 */
function byPrimaryThenKind(left: ContactPoint, right: ContactPoint): number {
  if (left.isPrimary !== right.isPrimary) {
    return left.isPrimary ? -1 : 1;
  }
  if (left.contactKind !== right.contactKind) {
    return left.contactKind < right.contactKind ? -1 : 1;
  }
  return left.normalizedValue < right.normalizedValue ? -1 : 1;
}

/**
 * The one projection.
 *
 * The normalized and display values are dropped *here*, in a function whose
 * return type has nowhere to put them, rather than in the response class. A
 * later edit to the view type therefore cannot leak one without also changing
 * this function.
 */
function toContactView(contact: ContactPoint): AdminContactView {
  return {
    contactPointId: contact.id,
    kind: contact.contactKind,
    maskedValue: maskContact(contact.contactKind, contact.normalizedValue),
    verified: contact.verifiedAt !== undefined,
    primary: contact.isPrimary,
  };
}
