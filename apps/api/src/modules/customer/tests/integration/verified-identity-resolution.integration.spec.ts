/**
 * `APP4-B02` — verified-identity resolution against a real PostgreSQL instance.
 *
 * The rule under test is `ADR-DB2-001` r5, and the assertions that matter most
 * are the negative ones: an unverified row with the same address must not link,
 * a second customer must not appear, a second primary must not exist, and the
 * address must not reach the audit trail.
 *
 * Every contact value here is synthetic and uses `example.com` / a reserved
 * test range.
 */
import { newId } from '@embroidery/database';

import {
  createVerifiedIdentityContext,
  emailEvidence,
  phoneEvidence,
  seedContact,
  seedCustomer,
  type VerifiedIdentityContext,
} from './verified-identity-context';
import {
  activeVerifiedOwners,
  auditEventCount,
  auditEventsFor,
  contactValueAppearsInAudit,
  contactsOf,
  customerCount,
  primaryContactsOf,
} from './verified-identity-queries';
import { isVerifiedIdentityConflict } from '../../domain/identity/verified-identity-outcome';
import type { VerifiedIdentityConflictError } from '../../domain/identity/verified-identity-outcome';
import type { CustomerId } from '../../domain/repositories/customer.repository';

describe('APP4-B02 verified-identity resolution (integration)', () => {
  let context: VerifiedIdentityContext;

  beforeAll(async () => {
    context = await createVerifiedIdentityContext('app4-b02-resolution');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function failureOf(work: () => Promise<unknown>): Promise<VerifiedIdentityConflictError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isVerifiedIdentityConflict(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to be refused, but it succeeded.');
  }

  describe('first verified identity', () => {
    it('creates exactly one customer with one primary verified contact, and audits it', async () => {
      const evidence = emailEvidence('First.Customer@Example.com');

      const result = await context.inRequest(() => context.service.resolve(evidence));

      expect(result.outcome).toBe('CREATED');
      expect(await customerCount(context)).toBe(1);

      const contacts = await contactsOf(context, result.customerId);
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toMatchObject({
        id: result.contactPointId,
        contact_kind: 'EMAIL',
        // The P01 canonical form, not the as-entered casing.
        normalized_value: 'first.customer@example.com',
        is_primary: true,
        verified_source: 'OTP',
      });
      expect(contacts[0]?.verified_at).not.toBeNull();
      expect(contacts[0]?.deactivated_at).toBeNull();
      expect(await primaryContactsOf(context, result.customerId)).toHaveLength(1);

      const events = await auditEventsFor(context, result.customerId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'customer.identity_created',
        // The customer whose possession was just proven — not SYSTEM, and not an
        // invented admin.
        actor_kind: 'CUSTOMER',
        customer_id: result.customerId,
        target_kind: 'CUSTOMER',
        target_id: result.customerId,
        correlation_id: context.requestId,
      });
      expect(events[0]?.summary).toEqual({
        contactPointId: result.contactPointId,
        contactKind: 'EMAIL',
        isPrimary: true,
      });

      // The address is in the contact row, and nowhere in the evidence trail.
      expect(await contactValueAppearsInAudit(context, 'first.customer@example.com')).toBe(false);
      expect(await contactValueAppearsInAudit(context, 'First.Customer@Example.com')).toBe(false);
      expect(await contactValueAppearsInAudit(context, 'example.com')).toBe(false);
    });

    it('creates a phone identity through the same path', async () => {
      const evidence = phoneEvidence('0912345678');

      const result = await context.inRequest(() => context.service.resolve(evidence));

      const contacts = await contactsOf(context, result.customerId);
      expect(contacts[0]).toMatchObject({ contact_kind: 'PHONE', is_primary: true });
      expect(contacts[0]?.normalized_value.startsWith('+84')).toBe(true);
      expect(await contactValueAppearsInAudit(context, '912345678')).toBe(false);
    });

    it('refuses a verified source that is not a bounded reference', async () => {
      // The one field a caller could fill with anything. A contact value spilled
      // into `verified_source` would be PII in a column operators read.
      const failure = await failureOf(() =>
        context.inRequest(() =>
          context.service.resolve(emailEvidence('a@example.com', 'user typed a@example.com')),
        ),
      );

      expect(failure.failure).toBe('VERIFIED_SOURCE_NOT_ALLOWED');
      expect(await customerCount(context)).toBe(0);
    });
  });

  describe('existing verified identity', () => {
    it('resolves the same customer and writes nothing', async () => {
      const evidence = emailEvidence('returning@example.com');
      const first = await context.inRequest(() => context.service.resolve(evidence));

      const second = await context.inRequest(() =>
        // A fresh verification of the same address: same identity, new instant.
        context.service.resolve(emailEvidence('RETURNING@example.com')),
      );

      expect(second.outcome).toBe('RESOLVED');
      expect(second.customerId).toBe(first.customerId);
      expect(second.contactPointId).toBe(first.contactPointId);
      expect(await customerCount(context)).toBe(1);
      expect(await contactsOf(context, first.customerId)).toHaveLength(1);
      expect(await primaryContactsOf(context, first.customerId)).toHaveLength(1);
      // Resolving changed nothing, so it recorded nothing: r5 audits the link,
      // and no link was made.
      expect(await auditEventCount(context)).toBe(1);
    });

    it('is idempotent across repeated resolutions', async () => {
      const raw = 'repeat@example.com';
      const first = await context.inRequest(() => context.service.resolve(emailEvidence(raw)));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const again = await context.inRequest(() => context.service.resolve(emailEvidence(raw)));
        expect(again.customerId).toBe(first.customerId);
        expect(again.outcome).toBe('RESOLVED');
      }

      expect(await customerCount(context)).toBe(1);
      expect(await activeVerifiedOwners(context, 'EMAIL', 'repeat@example.com')).toHaveLength(1);
      expect(await primaryContactsOf(context, first.customerId)).toHaveLength(1);
      expect(await auditEventCount(context)).toBe(1);
    });
  });

  describe('unverified and deactivated rows never decide identity', () => {
    it('creates a new customer when the only match is unverified', async () => {
      // `ADR-DB2-001` r5: raw string matches on unverified contacts never link.
      // CST-005 permits this row to coexist because it is not verified.
      const stranger = await seedCustomer(context);
      await seedContact(context, {
        customerId: stranger,
        contactKind: 'EMAIL',
        normalizedValue: 'shared@example.com',
        verifiedAt: undefined,
      });

      const result = await context.inRequest(() =>
        context.service.resolve(emailEvidence('shared@example.com')),
      );

      expect(result.outcome).toBe('CREATED');
      expect(result.customerId).not.toBe(stranger);
      expect(await customerCount(context)).toBe(2);
      // Exactly one *active verified* owner, and it is the new customer.
      const owners = await activeVerifiedOwners(context, 'EMAIL', 'shared@example.com');
      expect(owners).toHaveLength(1);
      expect(owners[0]?.customer_id).toBe(result.customerId);
      // The stranger was not touched: no verification, no primary, no audit.
      const strangerContacts = await contactsOf(context, stranger);
      expect(strangerContacts[0]?.verified_at).toBeNull();
      expect(await auditEventsFor(context, stranger)).toEqual([]);
    });

    it('creates a new customer when the only match is deactivated', async () => {
      const stranger = await seedCustomer(context);
      await seedContact(context, {
        customerId: stranger,
        contactKind: 'EMAIL',
        normalizedValue: 'recycled@example.com',
        verifiedAt: new Date(),
        deactivatedAt: new Date(),
      });

      const result = await context.inRequest(() =>
        context.service.resolve(emailEvidence('recycled@example.com')),
      );

      expect(result.outcome).toBe('CREATED');
      expect(result.customerId).not.toBe(stranger);
    });
  });

  describe('additional verified contact', () => {
    it('attaches a second contact without creating a second primary', async () => {
      const first = await context.inRequest(() =>
        context.service.resolve(emailEvidence('multi@example.com')),
      );

      const attachment = await context.inRequest(() =>
        context.service.attachVerifiedContact({
          customerId: first.customerId,
          evidence: phoneEvidence('0912345678'),
        }),
      );

      expect(attachment.outcome).toBe('ATTACHED');
      const contacts = await contactsOf(context, first.customerId);
      expect(contacts).toHaveLength(2);
      // CST-006 still sees exactly one, and it is still the original: B02
      // rotates the primary for nobody.
      const primaries = await primaryContactsOf(context, first.customerId);
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.id).toBe(first.contactPointId);

      const attached = contacts.find((row) => row.id === attachment.contactPointId);
      expect(attached).toMatchObject({ contact_kind: 'PHONE', is_primary: false });
      expect(attached?.verified_at).not.toBeNull();

      const events = await auditEventsFor(context, first.customerId);
      expect(events.map((event) => event.action)).toEqual([
        'customer.identity_created',
        'customer.contact_attached',
      ]);
      expect(events[1]?.summary).toEqual({
        contactPointId: attachment.contactPointId,
        contactKind: 'PHONE',
        isPrimary: false,
      });
      expect(await contactValueAppearsInAudit(context, '912345678')).toBe(false);
    });

    it('is idempotent when the customer already owns the contact', async () => {
      const first = await context.inRequest(() =>
        context.service.resolve(emailEvidence('own@example.com')),
      );

      const attachment = await context.inRequest(() =>
        context.service.attachVerifiedContact({
          customerId: first.customerId,
          evidence: emailEvidence('own@example.com'),
        }),
      );

      expect(attachment).toEqual({
        outcome: 'ALREADY_OWNED',
        contactPointId: first.contactPointId,
      });
      expect(await contactsOf(context, first.customerId)).toHaveLength(1);
      expect(await auditEventCount(context)).toBe(1);
    });

    it('refuses to steal a contact another customer holds verified and active', async () => {
      const owner = await context.inRequest(() =>
        context.service.resolve(emailEvidence('owned@example.com')),
      );
      const other = await context.inRequest(() =>
        context.service.resolve(emailEvidence('other@example.com')),
      );

      const failure = await failureOf(() =>
        context.inRequest(() =>
          context.service.attachVerifiedContact({
            customerId: other.customerId,
            evidence: emailEvidence('owned@example.com'),
          }),
        ),
      );

      expect(failure.failure).toBe('CONTACT_OWNED_BY_ANOTHER_CUSTOMER');
      // No reassignment, no merge, no new row.
      const owners = await activeVerifiedOwners(context, 'EMAIL', 'owned@example.com');
      expect(owners).toHaveLength(1);
      expect(owners[0]?.customer_id).toBe(owner.customerId);
      expect(await contactsOf(context, other.customerId)).toHaveLength(1);
      expect(await auditEventsFor(context, other.customerId)).toHaveLength(1);
    });

    it('refuses an unknown customer', async () => {
      const failure = await failureOf(() =>
        context.inRequest(() =>
          context.service.attachVerifiedContact({
            customerId: newId() as CustomerId,
            evidence: emailEvidence('ghost@example.com'),
          }),
        ),
      );

      expect(failure.failure).toBe('CUSTOMER_NOT_FOUND');
      expect(await customerCount(context)).toBe(0);
    });
  });

  describe('merge tombstones', () => {
    it('refuses to resolve through a merged customer instead of following the pointer', async () => {
      // A state no delivered code can produce — merge is G10's — seeded directly
      // so the guard is proven rather than asserted. Following the pointer would
      // be inventing merge mechanics inside a checkpoint forbidden to have any.
      const survivor = await seedCustomer(context);
      const loser = await seedCustomer(context, { mergedInto: survivor });
      await seedContact(context, {
        customerId: loser,
        contactKind: 'EMAIL',
        normalizedValue: 'tombstone@example.com',
        isPrimary: true,
        verifiedAt: new Date(),
      });

      const failure = await failureOf(() =>
        context.inRequest(() => context.service.resolve(emailEvidence('tombstone@example.com'))),
      );

      expect(failure.failure).toBe('CONTACT_OWNED_BY_MERGED_CUSTOMER');
      expect(await customerCount(context)).toBe(2);
      expect(await auditEventCount(context)).toBe(0);
    });
  });

  describe('transactional consistency', () => {
    it("leaves no customer behind when the caller's transaction rolls back", async () => {
      // The `APP4-B04` shape: the caller owns the transaction and B02 joins it.
      // If the enclosing work fails after resolution, the identity must not
      // survive on its own — a customer whose verification never completed.
      await expect(
        context.inRequest(() =>
          context.inTransaction(async () => {
            await context.service.resolve(emailEvidence('rolled-back@example.com'));
            throw new Error('the enclosing verification failed after resolution');
          }),
        ),
      ).rejects.toThrow('the enclosing verification failed after resolution');

      expect(await customerCount(context)).toBe(0);
      expect(await activeVerifiedOwners(context, 'EMAIL', 'rolled-back@example.com')).toHaveLength(
        0,
      );
      // The audit row rolled back with the action it described.
      expect(await auditEventCount(context)).toBe(0);
    });

    it("commits identity and evidence together inside a caller's transaction", async () => {
      const result = await context.inRequest(() =>
        context.inTransaction(() => context.service.resolve(emailEvidence('nested@example.com'))),
      );

      expect(result.outcome).toBe('CREATED');
      expect(await customerCount(context)).toBe(1);
      expect(await auditEventsFor(context, result.customerId)).toHaveLength(1);
    });
  });
});
