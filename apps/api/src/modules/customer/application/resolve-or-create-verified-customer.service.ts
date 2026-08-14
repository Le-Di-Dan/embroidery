/**
 * The verified-identity resolution rule, implemented exactly once (`APP4-B02`,
 * `ADR-DB2-001` r5/r6/r7).
 *
 * This is the **only** way a `customers` row comes into existence, and it takes
 * proof of verification as its input rather than a contact string. There is no
 * HTTP surface here and there will not be one: creation is a side effect of a
 * successful verification, so the caller is `APP4-B04` completing a challenge,
 * never a request body.
 *
 * ### Why the pre-read and the constraint are both needed
 *
 * The lookup answers the ordinary question — does this identity already have an
 * owner — and CST-005 answers the one a lookup cannot: whether another
 * transaction is answering it at the same time. A read-then-write check alone
 * would create two customers for one identity under concurrency, which is the
 * exact defect the partial unique index exists to make impossible. So the read
 * is an optimisation over the common case and the index is the arbiter, never
 * the other way round.
 *
 * ### Why a lost race throws instead of returning
 *
 * PostgreSQL aborts the whole transaction on the 23505, so after it there is no
 * usable transaction left to resolve the winner in. Worse, the transaction may
 * not be this service's: `TransactionManager` joins an enclosing one, so when
 * `APP4-B04` calls this inside its verification-completion transaction, the
 * abort belongs to B04. Returning a value would be claiming a partial success
 * inside a transaction that can only roll back. So a bounded error is thrown, no
 * further statement is issued, and the boundary that owns the transaction rolls
 * it back — which is also what guarantees the loser leaves no orphan customer.
 *
 * ### What this service never does
 *
 * It writes no `merged_into_customer_id`, creates no merge case, moves no
 * contact between customers, chooses no survivor, authors no business profile,
 * lists nothing and searches nothing. Every one of those is a different
 * checkpoint or a different ADR rule.
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError, isPersistenceError, newId } from '@embroidery/database';
import type { ContactKind } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type ContactPointId,
  type Customer,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  isWellFormedVerifiedSource,
  type VerifiedContactEvidence,
} from '../domain/identity/verified-contact-evidence';
import {
  ALREADY_OWNED,
  ATTACHED,
  CREATED,
  RESOLVED,
  VerifiedIdentityConflictError,
  type VerifiedContactAttachment,
  type VerifiedIdentityResolution,
} from '../domain/identity/verified-identity-outcome';
import { CustomerIdentityAuditRecorder } from './customer-identity-audit.recorder';

/**
 * The catalogued meaning of CST-005 / `uq_customer_contact_points__kind_value__verified`.
 *
 * Matched on the **code**, not on a SQLSTATE and not on a constraint name: the
 * persistence layer already resolved the exact arbiter into this stable code, so
 * reading it here keeps every driver detail — including `DETAIL`, which names the
 * duplicated contact value — on the far side of the boundary. A bare `23505`
 * check would also catch CST-006 and the primary-key arbiter, which mean
 * entirely different things.
 */
const CONTACT_ALREADY_VERIFIED = 'CONTACT_ALREADY_VERIFIED';

export interface AttachVerifiedContactInput {
  readonly customerId: CustomerId;
  readonly evidence: VerifiedContactEvidence;
}

@Injectable()
export class ResolveOrCreateVerifiedCustomer {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly transactions: TransactionManager,
    private readonly audit: CustomerIdentityAuditRecorder,
  ) {}

  /**
   * Resolves the customer behind a just-verified contact, creating one if the
   * identity has no owner yet (`ADR-DB2-001` r5).
   *
   * Joins the caller's transaction when there is one, so `APP4-B04` can complete
   * a challenge and establish the identity as one atomic act.
   */
  async resolve(evidence: VerifiedContactEvidence): Promise<VerifiedIdentityResolution> {
    assertBoundedSource(evidence);

    return this.guardConflicts(() =>
      this.transactions.runInTransaction(async () => {
        const owner = await this.findActiveOwner(
          evidence.contact.kind,
          evidence.contact.normalized,
        );

        if (owner !== undefined) {
          // Case A — the identity already has an owner. Nothing is written: no
          // second customer, no duplicate contact, no re-verification of a link
          // that is already verified, and therefore no audit row.
          return {
            outcome: RESOLVED,
            customerId: owner.customer.id,
            contactPointId: owner.contact.id,
          };
        }

        return await this.create(evidence);
      }),
    );
  }

  /**
   * Attaches a further just-verified contact to a known customer
   * (`ADR-DB2-001` r7 — multiple contacts allowed, exactly one primary).
   *
   * The customer must already exist; this operation never creates one, because a
   * caller that has a customer id has already been through {@link resolve}.
   */
  async attachVerifiedContact(
    input: AttachVerifiedContactInput,
  ): Promise<VerifiedContactAttachment> {
    assertBoundedSource(input.evidence);
    const { contact } = input.evidence;

    return this.guardConflicts(() =>
      this.transactions.runInTransaction(async () => {
        const owner = await this.findActiveOwner(contact.kind, contact.normalized);

        if (owner !== undefined) {
          if (owner.customer.id !== input.customerId) {
            // Refused, never reassigned. CST-005 would refuse it physically a
            // moment later anyway; failing here means the refusal is a named
            // business outcome rather than a race the caller has to interpret.
            throw new VerifiedIdentityConflictError('CONTACT_OWNED_BY_ANOTHER_CUSTOMER');
          }
          // Idempotent: this customer already holds this contact verified and
          // active. Nothing is written, so nothing is audited.
          return { outcome: ALREADY_OWNED, contactPointId: owner.contact.id };
        }

        const customer = await this.customers.findById(input.customerId);
        if (customer === undefined) {
          throw new VerifiedIdentityConflictError('CUSTOMER_NOT_FOUND');
        }
        assertNotMerged(customer);

        // Added unverified and non-primary by the repository, then verified: that
        // order is what makes CST-005 apply at the moment the link becomes real,
        // and it leaves the customer's existing primary untouched, so CST-006
        // still sees exactly one. B02 rotates the primary for nobody — no locked
        // authority asks it to.
        const added = await this.customers.addContactPoint({
          id: newId() as ContactPointId,
          customerId: input.customerId,
          contactKind: contact.kind,
          normalizedValue: contact.normalized,
          displayValue: contact.display,
        });
        await this.customers.markContactVerified(
          added.id,
          input.evidence.verifiedAt,
          input.evidence.verifiedSource,
        );

        await this.audit.recordContactAttached({
          customerId: input.customerId,
          contactPointId: added.id,
          contactKind: contact.kind,
          isPrimary: false,
        });

        return { outcome: ATTACHED, contactPointId: added.id };
      }),
    );
  }

  /** Case B — the identity has no owner, so it gets one. */
  private async create(evidence: VerifiedContactEvidence): Promise<VerifiedIdentityResolution> {
    const customerId = newId() as CustomerId;
    const contactPointId = newId() as ContactPointId;
    const { contact } = evidence;

    // One repository call, two tables, inside the transaction: a customer
    // without its identity contact is not a state the model permits, so the
    // repository refuses to write either half on its own.
    await this.customers.createWithVerifiedContact({
      id: customerId,
      contact: {
        id: contactPointId,
        contactKind: contact.kind,
        normalizedValue: contact.normalized,
        displayValue: contact.display,
        verifiedSource: evidence.verifiedSource,
      },
      verifiedAt: evidence.verifiedAt,
    });

    // After the customer row exists, because the audit actor is that customer
    // and `fk_audit_events__customer_id` has to resolve.
    await this.audit.recordIdentityCreated({
      customerId,
      contactPointId,
      contactKind: contact.kind,
      isPrimary: true,
    });

    return { outcome: CREATED, customerId, contactPointId };
  }

  /**
   * The customer and the exact contact point that carry an active verified
   * identity, if any.
   *
   * Two reads rather than a new repository method: `findByVerifiedContact`
   * already matches the CST-005 predicate exactly, and the contact point is then
   * picked out of that one customer's own contacts. Widening the repository for
   * an arbitrary contact-shaped lookup is what `APP4-B07` owns and what §15
   * forbids here.
   */
  private async findActiveOwner(
    kind: ContactKind,
    normalized: string,
  ): Promise<{ customer: Customer; contact: ContactPoint } | undefined> {
    const customer = await this.customers.findByVerifiedContact(kind, normalized);
    if (customer === undefined) {
      return undefined;
    }
    assertNotMerged(customer);

    const contacts = await this.customers.listContactPoints(customer.id);
    const contact = contacts.find(
      (candidate) =>
        candidate.contactKind === kind &&
        candidate.normalizedValue === normalized &&
        candidate.verifiedAt !== undefined &&
        candidate.deactivatedAt === undefined,
    );
    if (contact === undefined) {
      // Unreachable: the customer was found *through* that very row, inside this
      // transaction. A hard stop rather than a non-null assertion, because
      // inventing an id here would file audit evidence against a contact point
      // that does not exist. Not one of the bounded failures — those name
      // situations the model refuses, and this one names a defect.
      throw guardViolationError(
        'ResolveOrCreateVerifiedCustomer.findActiveOwner',
        'VERIFIED_CONTACT_NOT_RESOLVABLE',
        'That contact could not be resolved.',
      );
    }
    return { customer, contact };
  }

  /**
   * Translates the one persistence conflict this service owns, and nothing else.
   *
   * Caught **outside** the transaction callback: when this service opened the
   * transaction, the rollback has already completed by the time this runs, so
   * the failure and the absence of an orphan customer are the same event. When
   * the transaction belongs to an enclosing caller, no further statement is
   * issued either way — the bounded error simply travels out to the boundary
   * that can roll back.
   *
   * Every other persistence error passes through untouched. Swallowing an
   * unrelated 23505 — CST-006's primary-contact arbiter, or a primary-key
   * collision — as a "concurrent verification loss" would report a race that did
   * not happen and hide a defect that did.
   */
  private async guardConflicts<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (
        isPersistenceError(error) &&
        error.kind === 'CONFLICT' &&
        error.code === CONTACT_ALREADY_VERIFIED
      ) {
        // The cause is dropped deliberately: a `PersistenceError` carries
        // non-enumerable diagnostics naming the constraint, and the driver error
        // beneath it carries PostgreSQL's `DETAIL`, which quotes the duplicated
        // contact value. Neither may travel further than this line.
        throw new VerifiedIdentityConflictError('CONCURRENT_VERIFICATION_LOSS');
      }
      throw error;
    }
  }
}

function assertBoundedSource(evidence: VerifiedContactEvidence): void {
  if (!isWellFormedVerifiedSource(evidence.verifiedSource)) {
    throw new VerifiedIdentityConflictError('VERIFIED_SOURCE_NOT_ALLOWED');
  }
}

function assertNotMerged(customer: Customer): void {
  if (customer.mergedIntoCustomerId !== undefined) {
    throw new VerifiedIdentityConflictError('CONTACT_OWNED_BY_MERGED_CUSTOMER');
  }
}
