/**
 * The two contact-maintenance mutations (`APP10-B01` §5, §6).
 *
 * ```text
 * POST .../contacts/{contactId}/primary     — adminCustomerContact_promote
 * POST .../contacts/{contactId}/deactivate  — adminCustomerContact_deactivate
 * ```
 *
 * Real HTTP application, real `AuthenticatedAdminGuard`, disposable PostgreSQL.
 *
 * The claims here are mostly about what did **not** move: a contact value never
 * rewritten, `verified_at` never written or cleared, exactly one primary at
 * every point, and a foreign contact id answered exactly as a missing one. Each
 * is asserted against the rows, because none of those columns is publishable
 * and a response-level assertion could not see them.
 */
import request from 'supertest';

import {
  FIXTURE_EMAIL,
  FIXTURE_PHONE,
  ROUTES,
  createAdminSupportContext,
  type AdminSupportTestContext,
} from './admin-support-context';
import {
  auditRows,
  contactRow,
  contactRows,
  seedContact,
  seedCustomerWithOneContact,
  tombstone,
} from './customer-maintenance-queries';

const UNKNOWN_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099';

/** The parts of a refusal envelope that are not per-request by construction. */
function refusalOf(response: { readonly status: number; readonly body: unknown }): unknown {
  const { code, message, success } = response.body as Record<string, unknown>;
  return { status: response.status, code, message, success };
}

describe('APP10-B01 · Admin customer contact maintenance', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b01-contact');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const promote = (customerId: string, contactId: string) =>
    request(context.server())
      .post(ROUTES.promoteContact(customerId, contactId))
      .set('Cookie', context.adminCookie());

  const deactivate = (customerId: string, contactId: string) =>
    request(context.server())
      .post(ROUTES.deactivateContact(customerId, contactId))
      .set('Cookie', context.adminCookie());

  describe('promotion', () => {
    it('moves the designation atomically and audits it once', async () => {
      const seeded = await context.seedCustomer();

      await promote(seeded.customerId, seeded.phoneContactId).expect(204);

      const contacts = await contactRows(context, seeded.customerId);
      // Exactly one primary at the end — the CST-006 partial unique would have
      // rejected the pair had the clear and the set not been one transaction.
      expect(contacts.filter((row) => row.is_primary)).toHaveLength(1);
      expect(contacts.find((row) => row.is_primary)?.id).toBe(seeded.phoneContactId);

      const events = await auditRows(context, seeded.customerId);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('customer.primary_contact_changed');
      expect(events[0]?.actor_kind).toBe('ADMIN');
      expect(events[0]?.admin_id).toBe(context.adminId());
      expect(events[0]?.summary).toEqual({
        contactPointId: seeded.phoneContactId,
        contactKind: 'PHONE',
        previousPrimaryContactPointId: seeded.emailContactId,
      });
    });

    it('never rewrites a contact value or its verification evidence', async () => {
      const seeded = await context.seedCustomer();
      const before = await contactRows(context, seeded.customerId);

      await promote(seeded.customerId, seeded.phoneContactId).expect(204);

      for (const after of await contactRows(context, seeded.customerId)) {
        const original = before.find((row) => row.id === after.id);
        expect(after.normalized_value).toBe(original?.normalized_value);
        expect(after.display_value).toBe(original?.display_value);
        expect(after.verified_at).toBe(original?.verified_at);
        expect(after.verified_source).toBe(original?.verified_source);
        expect(after.deactivated_at).toBe(original?.deactivated_at);
      }
      // And no contact was duplicated to carry the new designation.
      expect(await contactRows(context, seeded.customerId)).toHaveLength(before.length);
    });

    it('is an idempotent no-op when the contact is already primary', async () => {
      const seeded = await context.seedCustomer();
      const before = await contactRows(context, seeded.customerId);

      await promote(seeded.customerId, seeded.emailContactId).expect(204);
      await promote(seeded.customerId, seeded.emailContactId).expect(204);

      expect(await contactRows(context, seeded.customerId)).toEqual(before);
      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });

    it('refuses an unverified contact and writes nothing', async () => {
      const seeded = await context.seedCustomer();
      const unverified = await seedContact(context, {
        customerId: seeded.customerId,
        kind: 'EMAIL',
        value: 'unproven@vidu-b01.test',
        verified: false,
      });

      await promote(seeded.customerId, unverified).expect(409);

      // The refusal minted no evidence: an Admin promotion must never be a way
      // to make a channel verified.
      expect((await contactRow(context, unverified)).verified_at).toBeNull();
      expect((await contactRow(context, unverified)).is_primary).toBe(false);
      expect((await contactRow(context, seeded.emailContactId)).is_primary).toBe(true);
      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });

    it('refuses a deactivated contact', async () => {
      const seeded = await context.seedCustomer();
      const retired = await seedContact(context, {
        customerId: seeded.customerId,
        kind: 'EMAIL',
        value: 'retired@vidu-b01.test',
        deactivated: true,
      });

      await promote(seeded.customerId, retired).expect(409);

      expect((await contactRow(context, retired)).is_primary).toBe(false);
      expect((await contactRow(context, seeded.emailContactId)).is_primary).toBe(true);
    });

    it('refuses a merged customer', async () => {
      const survivor = await context.seedCustomer();
      const loser = await context.seedCustomer({
        email: 'loser@vidu-b01.test',
        phone: '+84900000001',
      });
      await tombstone(context, loser.customerId, survivor.customerId);

      await promote(loser.customerId, loser.phoneContactId).expect(409);

      expect((await contactRow(context, loser.phoneContactId)).is_primary).toBe(false);
    });
  });

  describe('deactivation', () => {
    it('retires the contact softly and audits it once', async () => {
      const seeded = await context.seedCustomer();
      const extra = await seedContact(context, {
        customerId: seeded.customerId,
        kind: 'EMAIL',
        value: 'second@vidu-b01.test',
      });

      await deactivate(seeded.customerId, extra).expect(204);

      const row = await contactRow(context, extra);
      // Soft: the row is still here, and so is everything that made it
      // evidence. Only the deactivation instant is new.
      expect(row.deactivated_at).not.toBeNull();
      expect(row.verified_at).not.toBeNull();
      expect(row.normalized_value).toBe('second@vidu-b01.test');
      expect(await contactRows(context, seeded.customerId)).toHaveLength(3);

      const events = await auditRows(context, seeded.customerId);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('customer.contact_deactivated');
      expect(events[0]?.admin_id).toBe(context.adminId());
      expect(events[0]?.summary).toEqual({ contactPointId: extra, contactKind: 'EMAIL' });
    });

    it('promotes nothing as a side effect', async () => {
      const seeded = await context.seedCustomer();

      await deactivate(seeded.customerId, seeded.phoneContactId).expect(204);

      const contacts = await contactRows(context, seeded.customerId);
      expect(contacts.filter((row) => row.is_primary).map((row) => row.id)).toEqual([
        seeded.emailContactId,
      ]);
    });

    it('refuses the primary contact', async () => {
      const seeded = await context.seedCustomer();

      await deactivate(seeded.customerId, seeded.emailContactId).expect(409);

      const row = await contactRow(context, seeded.emailContactId);
      expect(row.deactivated_at).toBeNull();
      expect(row.is_primary).toBe(true);
      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });

    it('refuses the last verified contact', async () => {
      // A customer whose one verified channel is *not* the primary flag's
      // holder, so the primary rule cannot be what refuses this.
      const { customerId, contactId } = await seedCustomerWithOneContact(
        context,
        'only@vidu-b01.test',
        { primary: false },
      );

      await deactivate(customerId, contactId).expect(409);

      expect((await contactRow(context, contactId)).deactivated_at).toBeNull();
      expect(await auditRows(context, customerId)).toHaveLength(0);
    });

    it('is an idempotent no-op when the contact is already deactivated', async () => {
      const seeded = await context.seedCustomer();
      const retired = await seedContact(context, {
        customerId: seeded.customerId,
        kind: 'EMAIL',
        value: 'retired@vidu-b01.test',
        deactivated: true,
      });
      const before = await contactRow(context, retired);

      await deactivate(seeded.customerId, retired).expect(204);

      // The recorded instant did not move: a replay must not rewrite when the
      // channel was actually retired.
      expect(await contactRow(context, retired)).toEqual(before);
      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });

    it('refuses a merged customer', async () => {
      const survivor = await context.seedCustomer();
      const loser = await context.seedCustomer({
        email: 'loser@vidu-b01.test',
        phone: '+84900000001',
      });
      await tombstone(context, loser.customerId, survivor.customerId);

      await deactivate(loser.customerId, loser.phoneContactId).expect(409);

      expect((await contactRow(context, loser.phoneContactId)).deactivated_at).toBeNull();
    });
  });

  describe('non-enumeration', () => {
    it.each([
      ['promote', (customerId: string, contactId: string) => promote(customerId, contactId)],
      ['deactivate', (customerId: string, contactId: string) => deactivate(customerId, contactId)],
    ])(
      '%s answers a foreign contact id exactly as a missing one, and leaks nothing',
      async (_label, call) => {
        const owner = await context.seedCustomer();
        const other = await context.seedCustomer({
          email: 'other@vidu-b01.test',
          phone: '+84900000002',
        });

        const foreign = await call(owner.customerId, other.phoneContactId).expect(404);
        const missing = await call(owner.customerId, UNKNOWN_ID).expect(404);

        // Identical in everything the caller could read a signal from. The
        // envelope's `requestId` and `timestamp` differ between any two
        // requests by construction, so they are excluded rather than the
        // comparison being weakened: what must match is the status, the code
        // and the message, and an operator holding one Customer's contact id
        // cannot learn from these two answers that it belongs to somebody else.
        expect(refusalOf(foreign)).toEqual(refusalOf(missing));
        const body = JSON.stringify(foreign.body);
        expect(body).not.toContain(other.customerId);
        expect(body).not.toContain(other.phoneContactId);
        expect(body).not.toContain('other@vidu-b01.test');
        expect(body).not.toContain('+84900000002');
        // And the foreign row is untouched.
        const row = await contactRow(context, other.phoneContactId);
        expect(row.deactivated_at).toBeNull();
        expect(row.is_primary).toBe(false);
        expect(await auditRows(context, other.customerId)).toHaveLength(0);
      },
    );

    it('never publishes a contact value in a refusal', async () => {
      const seeded = await context.seedCustomer();

      const response = await deactivate(seeded.customerId, seeded.emailContactId).expect(409);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_PHONE);
      expect(body).not.toContain('b***@vidu-b07.test');
    });

    it('answers 404 for an unknown customer and 400 for a malformed id', async () => {
      await promote(UNKNOWN_ID, UNKNOWN_ID).expect(404);
      await promote('not-a-uuid', UNKNOWN_ID).expect(400);
      await deactivate(UNKNOWN_ID, 'not-a-uuid').expect(400);
    });
  });

  describe('guards', () => {
    it.each([
      ['promote', ROUTES.promoteContact],
      ['deactivate', ROUTES.deactivateContact],
    ])('%s refuses an unauthenticated caller', async (_label, route) => {
      const seeded = await context.seedCustomer();

      await request(context.server())
        .post(route(seeded.customerId, seeded.phoneContactId))
        .expect(401);

      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });

    it.each([
      ['promote', ROUTES.promoteContact],
      ['deactivate', ROUTES.deactivateContact],
    ])('%s refuses an origin outside the Admin allowlist', async (_label, route) => {
      const seeded = await context.seedCustomer();

      await request(context.server())
        .post(route(seeded.customerId, seeded.phoneContactId))
        .set('Cookie', context.adminCookie())
        .set('Origin', 'https://attacker.example')
        .expect(403);

      expect(await auditRows(context, seeded.customerId)).toHaveLength(0);
    });
  });
});
