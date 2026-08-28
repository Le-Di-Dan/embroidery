/**
 * `PATCH /api/admin/customers/{customerId}` — `adminCustomer_update`
 * (`APP10-B01` §4), and the projection change that makes B01's contact
 * operations addressable (§7).
 *
 * Against the real HTTP application, the real `AuthenticatedAdminGuard` and a
 * disposable PostgreSQL — no guard override anywhere, for the reason
 * `admin-support-context.ts` records: a stubbed guard proves the handler runs
 * once something lets it, which is not the claim.
 *
 * The assertions that matter most are negative, and they are phrased against
 * the **rows** rather than the response, because the columns they protect are
 * ones this API deliberately never publishes. A patch cannot be shown to have
 * left `verified_at` alone by reading a body that could not have carried it.
 */
import request from 'supertest';

import {
  ROUTES,
  createAdminSupportContext,
  dataOf,
  type AdminSupportTestContext,
} from './admin-support-context';
import {
  auditRows,
  contactRows,
  customerRow,
  seedContact,
  tombstone,
} from './customer-maintenance-queries';

interface DetailPayload {
  readonly customerId: string;
  readonly displayName?: string;
  readonly notes?: string;
  readonly verifiedAt: string;
  readonly contacts: readonly {
    readonly contactId: string;
    readonly kind: string;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}

describe('APP10-B01 · Admin customer profile maintenance', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b01-profile');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const patch = (customerId: string, body: object) =>
    request(context.server())
      .patch(ROUTES.updateProfile(customerId))
      .set('Cookie', context.adminCookie())
      .send(body);

  describe('the bounded write', () => {
    it('stores both fields and audits the change once', async () => {
      const { customerId } = await context.seedCustomer();

      await patch(customerId, { displayName: 'Trần Bảo Ngọc', notes: 'Calls after 4pm.' }).expect(
        204,
      );

      const row = await customerRow(context, customerId);
      expect(row.display_name).toBe('Trần Bảo Ngọc');
      expect(row.notes).toBe('Calls after 4pm.');

      const events = await auditRows(context, customerId);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('customer.profile_updated');
      expect(events[0]?.actor_kind).toBe('ADMIN');
      expect(events[0]?.admin_id).toBe(context.adminId());
      expect(events[0]?.summary).toEqual({ changedFields: ['displayName', 'notes'] });
    });

    it('leaves an omitted field alone', async () => {
      const { customerId } = await context.seedCustomer();
      await patch(customerId, { displayName: 'Lê Hoàng', notes: 'First note.' }).expect(204);

      await patch(customerId, { displayName: 'Lê Hoàng Nam' }).expect(204);

      const row = await customerRow(context, customerId);
      expect(row.display_name).toBe('Lê Hoàng Nam');
      expect(row.notes).toBe('First note.');
      const events = await auditRows(context, customerId);
      expect(events.map((event) => event.summary)).toEqual([
        { changedFields: ['displayName', 'notes'] },
        { changedFields: ['displayName'] },
      ]);
    });

    it.each([
      ['null', null],
      ['a blank string', '   '],
    ])('clears a field sent as %s', async (_label, value) => {
      const { customerId } = await context.seedCustomer();
      await patch(customerId, { notes: 'Something to clear.' }).expect(204);

      await patch(customerId, { notes: value }).expect(204);

      expect((await customerRow(context, customerId)).notes).toBeNull();
    });

    it('touches nothing outside the two fields', async () => {
      const { customerId, emailContactId } = await context.seedCustomer();
      const before = await customerRow(context, customerId);
      const contactsBefore = await contactRows(context, customerId);

      await patch(customerId, { displayName: 'Đỗ Thu Hà', notes: 'A note.' }).expect(204);

      const after = await customerRow(context, customerId);
      // `verified_at` is the verification fact itself and is immutable; the
      // merge pointer belongs to the merge checkpoint; `anonymized_at` to
      // retention. A patch reaches none of the three.
      expect(after.verified_at).toBe(before.verified_at);
      expect(after.merged_into_customer_id).toBeNull();
      expect(after.anonymized_at).toBeNull();
      // And no contact moved: not the value, not the verification instant, not
      // the primary designation, not the deactivation instant.
      expect(await contactRows(context, customerId)).toEqual(contactsBefore);
      expect((await contactRow(customerId, emailContactId)).verified_at).not.toBeNull();
    });

    async function contactRow(customerId: string, contactId: string) {
      const all = await contactRows(context, customerId);
      const found = all.find((row) => row.id === contactId);
      if (found === undefined) {
        throw new Error('fixture contact missing');
      }
      return found;
    }
  });

  describe('the no-op patch', () => {
    it('succeeds, writes nothing and appends no audit row', async () => {
      const { customerId } = await context.seedCustomer();
      await patch(customerId, { displayName: 'Phạm Anh', notes: 'Settled.' }).expect(204);
      const settled = await customerRow(context, customerId);

      await patch(customerId, { displayName: 'Phạm Anh', notes: 'Settled.' }).expect(204);

      const after = await customerRow(context, customerId);
      // `updated_at` is the evidence: a re-issued UPDATE would move it even
      // though the values matched, and a screen that saves on blur would then
      // rewrite the row on every visit.
      expect(after).toEqual(settled);
      expect(await auditRows(context, customerId)).toHaveLength(1);
    });

    it('treats clearing an already-empty field as no change', async () => {
      const { customerId } = await context.seedCustomer();
      // The fixture customer has a display name and no note.
      await patch(customerId, { notes: null }).expect(204);

      expect(await auditRows(context, customerId)).toHaveLength(0);
    });
  });

  describe('refusals', () => {
    it('refuses a merged customer with a conflict, and writes nothing', async () => {
      const survivor = await context.seedCustomer();
      const loser = await context.seedCustomer({
        email: 'loser@vidu-b01.test',
        phone: '+84900000001',
      });
      await tombstone(context, loser.customerId, survivor.customerId);
      const before = await customerRow(context, loser.customerId);

      await patch(loser.customerId, { displayName: 'Should not land' }).expect(409);

      // Not silently redirected to the survivor, and not applied to the loser.
      expect(await customerRow(context, loser.customerId)).toEqual(before);
      expect((await customerRow(context, survivor.customerId)).display_name).toBe('B07 Customer');
      expect(await auditRows(context, loser.customerId)).toHaveLength(0);
    });

    it('answers 404 for an unknown customer', async () => {
      await patch('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099', { notes: 'x' }).expect(404);
    });

    it('answers 400 for a malformed customer id', async () => {
      await patch('not-a-uuid', { notes: 'x' }).expect(400);
    });

    it.each([
      ['an empty patch', {}],
      ['an unknown field', { displayName: 'A', nickname: 'B' }],
      ['a non-string value', { notes: 42 }],
      ['an over-long display name', { displayName: 'x'.repeat(201) }],
      ['an over-long note', { notes: 'x'.repeat(2_001) }],
    ])('answers 400 for %s', async (_label, body) => {
      const { customerId } = await context.seedCustomer();
      await patch(customerId, body).expect(400);
      expect(await auditRows(context, customerId)).toHaveLength(0);
    });

    it.each([
      ['verifiedAt', { verifiedAt: '2020-01-01T00:00:00.000Z' }],
      ['mergedIntoCustomerId', { mergedIntoCustomerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' }],
      ['anonymizedAt', { anonymizedAt: '2020-01-01T00:00:00.000Z' }],
      ['a contact value', { contact: 'attacker@vidu-b01.test' }],
      ['a contact verification flag', { contacts: [{ verified: true }] }],
    ])('rejects a body carrying %s rather than ignoring it', async (_label, body) => {
      const { customerId } = await context.seedCustomer();
      const before = await customerRow(context, customerId);

      await patch(customerId, body).expect(400);

      expect(await customerRow(context, customerId)).toEqual(before);
    });
  });

  describe('guards', () => {
    it('refuses an unauthenticated caller', async () => {
      const { customerId } = await context.seedCustomer();

      await request(context.server())
        .patch(ROUTES.updateProfile(customerId))
        .send({ notes: 'x' })
        .expect(401);

      expect((await customerRow(context, customerId)).notes).toBeNull();
    });

    it('refuses an origin outside the Admin allowlist', async () => {
      const { customerId } = await context.seedCustomer();

      await request(context.server())
        .patch(ROUTES.updateProfile(customerId))
        .set('Cookie', context.adminCookie())
        .set('Origin', 'https://attacker.example')
        .send({ notes: 'x' })
        .expect(403);

      expect((await customerRow(context, customerId)).notes).toBeNull();
    });

    it('refuses a body that is not application/json', async () => {
      const { customerId } = await context.seedCustomer();

      await request(context.server())
        .patch(ROUTES.updateProfile(customerId))
        .set('Cookie', context.adminCookie())
        .set('Content-Type', 'text/plain')
        .send('notes=x')
        .expect(415);
    });
  });

  describe('the detail projection', () => {
    it('publishes an opaque contactId and the note, and still no raw contact', async () => {
      const seeded = await context.seedCustomer();
      await patch(seeded.customerId, { notes: 'Visible to staff only.' }).expect(204);

      const response = await request(context.server())
        .get(ROUTES.detail(seeded.customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const payload = dataOf<DetailPayload>(response);
      expect(payload.notes).toBe('Visible to staff only.');
      expect(payload.contacts.map((contact) => contact.contactId).sort()).toEqual(
        [seeded.emailContactId, seeded.phoneContactId].sort(),
      );
      // The ids are the routes' addresses and nothing more: the raw, normalized
      // and display values are still absent from the whole serialized response.
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('bay.nguyen@vidu-b07.test');
      expect(body).not.toContain('+84912345678');
      expect(body).not.toContain('normalizedValue');
      expect(body).not.toContain('displayValue');
      for (const contact of payload.contacts) {
        expect(Object.keys(contact).sort()).toEqual([
          'contactId',
          'kind',
          'maskedValue',
          'primary',
          'verified',
        ]);
      }
    });

    it('omits the note entirely when no operator has written one', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(dataOf<DetailPayload>(response)).not.toHaveProperty('notes');
    });

    it('does not publish a deactivated contact’s id', async () => {
      const seeded = await context.seedCustomer();
      const retired = await seedContact(context, {
        customerId: seeded.customerId,
        kind: 'EMAIL',
        value: 'retired@vidu-b01.test',
        deactivated: true,
      });

      const response = await request(context.server())
        .get(ROUTES.detail(seeded.customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(dataOf<DetailPayload>(response).contacts.map((c) => c.contactId)).not.toContain(
        retired,
      );
    });
  });
});
