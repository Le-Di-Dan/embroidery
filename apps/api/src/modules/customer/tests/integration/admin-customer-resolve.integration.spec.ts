/**
 * `APP4-B07` exact-contact resolver, through the whole HTTP stack against a real
 * PostgreSQL instance (Product Owner authority unblock, `APP4-A01`).
 *
 * The operation is the one place in APP4 where an authenticated operator submits
 * a real contact value, so the claims that live here are about what it will and
 * will not do with it:
 *
 * 1. **It resolves an exact, verified, current contact — and only that.** EMAIL
 *    and PHONE both work, through `APP4-P01`'s normalizer rather than a second
 *    one, so an operator who types the number the way a customer typed it
 *    reaches the same row.
 * 2. **Unknown, unverified, deactivated and malformed are one answer.** Four
 *    causes, one 404, no distinguishing body. Anything finer would answer
 *    "does this address exist", which is the enumeration question the phase
 *    refuses whoever asks it.
 * 3. **It cannot be made to search.** A prefix, a fragment and a differing
 *    domain all miss, so there is no partial match hiding behind the equality.
 * 4. **The submitted value comes back nowhere.** Not raw, not normalized, not
 *    masked — the response is searched as a whole string for each form.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  ROUTES,
  ADMIN_COOKIE_NAME,
  dataOf,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  FIXTURE_PHONE,
  FIXTURE_PHONE_MASK,
  SECOND_FIXTURE_EMAIL,
  createAdminSupportContext,
  type AdminSupportTestContext,
} from './admin-support-context';

interface Resolution {
  readonly customerId: string;
}

/** A verified, current contact on a customer of its own. */
async function seedLooseContact(
  context: AdminSupportTestContext,
  input: {
    readonly kind: 'EMAIL' | 'PHONE';
    readonly value: string;
    readonly verified: boolean;
    readonly deactivated: boolean;
  },
): Promise<{ readonly customerId: string }> {
  const customerId = newId();
  const contactId = newId();
  const verifiedAt = input.verified ? '2026-08-14T09:00:00.000Z' : null;
  const verifiedSource = input.verified ? 'OTP' : null;
  const deactivatedAt = input.deactivated ? '2026-08-14T10:00:00.000Z' : null;

  await context.disposable.client.db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'Resolver Fixture', '2026-08-14T09:00:00.000Z')
  `);
  await context.disposable.client.db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source, deactivated_at)
    values (${contactId}, ${customerId}, ${input.kind}, ${input.value}, ${input.value}, true,
            ${verifiedAt}, ${verifiedSource}, ${deactivatedAt})
  `);

  return { customerId };
}

describe('APP4-B07 Admin customer resolve (integration)', () => {
  let context: AdminSupportTestContext;

  const resolve = (body: unknown) =>
    request(context.server())
      .post(ROUTES.resolve())
      .set('Cookie', context.adminCookie())
      .set('Content-Type', 'application/json')
      .send(body as object);

  beforeAll(async () => {
    context = await createAdminSupportContext('app4-b07-resolve');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  describe('authorization', () => {
    it('refuses the resolver with no Admin session', async () => {
      await request(context.server())
        .post(ROUTES.resolve())
        .set('Content-Type', 'application/json')
        .send({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL })
        .expect(401);
    });

    it('refuses the resolver with a cookie that resolves to no session', async () => {
      await request(context.server())
        .post(ROUTES.resolve())
        .set('Cookie', `${ADMIN_COOKIE_NAME}=not-a-live-session-token`)
        .set('Content-Type', 'application/json')
        .send({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL })
        .expect(401);
    });

    it('refuses a cross-site origin through APP1’s existing guard', async () => {
      await context.seedCustomer();

      await resolve({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL })
        .set('Origin', 'https://attacker.example')
        .expect(403);
    });

    it('forbids caching the resolution', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await resolve({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL }).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(dataOf<Resolution>(response).customerId).toBe(customerId);
    });
  });

  describe('exact resolution', () => {
    it('resolves a verified EMAIL to its Customer', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await resolve({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL }).expect(200);

      expect(dataOf<Resolution>(response).customerId).toBe(customerId);
    });

    it('resolves a verified PHONE to its Customer', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await resolve({ contactKind: 'PHONE', contact: FIXTURE_PHONE }).expect(200);

      expect(dataOf<Resolution>(response).customerId).toBe(customerId);
    });

    it('normalizes through APP4-P01 rather than comparing what was typed', async () => {
      const { customerId } = await context.seedCustomer();

      // Stored normalized as `+84912345678`. A Vietnamese operator types the
      // national form with the trunk zero, and an email with stray case and
      // whitespace. Neither string equals the stored value, and both must land.
      const phone = await resolve({ contactKind: 'PHONE', contact: '0912345678' }).expect(200);
      expect(dataOf<Resolution>(phone).customerId).toBe(customerId);

      const email = await resolve({
        contactKind: 'EMAIL',
        contact: `  ${FIXTURE_EMAIL.toUpperCase()}  `,
      }).expect(200);
      expect(dataOf<Resolution>(email).customerId).toBe(customerId);
    });

    it('resolves each Customer to their own id and never to another’s', async () => {
      const first = await context.seedCustomer();
      const second = await context.seedCustomer({
        email: SECOND_FIXTURE_EMAIL,
        phone: '+84987654321',
      });

      const response = await resolve({
        contactKind: 'EMAIL',
        contact: SECOND_FIXTURE_EMAIL,
      }).expect(200);

      expect(dataOf<Resolution>(response).customerId).toBe(second.customerId);
      expect(dataOf<Resolution>(response).customerId).not.toBe(first.customerId);
    });

    it('returns the id alone — no contact in any form, and no Customer detail', async () => {
      await context.seedCustomer();

      const response = await resolve({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL }).expect(200);

      expect(Object.keys(dataOf<Resolution>(response))).toEqual(['customerId']);

      // Searched over the whole serialized body: the raw value, the normalized
      // value (identical here by construction) and — deliberately — the mask.
      // Echoing even the mask would confirm which value matched.
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_EMAIL_MASK);
      expect(body).not.toContain(FIXTURE_PHONE);
      expect(body).not.toContain(FIXTURE_PHONE_MASK);

      const lower = body.toLowerCase();
      for (const forbidden of [
        'contactpointid',
        'normalizedvalue',
        'displayvalue',
        'displayname',
        'verifiedat',
        'contacts',
        'maskedvalue',
      ]) {
        expect(lower).not.toContain(forbidden);
      }
    });
  });

  describe('one answer for every miss', () => {
    /**
     * The refusal must be identical whatever caused it.
     *
     * The `error` object only: `meta.requestId` and `meta.timestamp` differ per
     * request by design, and comparing them would fail for a reason that has
     * nothing to do with what the caller can learn about a contact.
     */
    const bodiesOf: string[] = [];

    const refusalOf = (response: { readonly body: unknown }): string =>
      JSON.stringify((response.body as { readonly error: unknown }).error);

    it('refuses an unknown contact', async () => {
      await context.seedCustomer();

      const response = await resolve({
        contactKind: 'EMAIL',
        contact: 'khong.ton.tai@vidu-b07.test',
      }).expect(404);

      bodiesOf.push(refusalOf(response));
    });

    it('refuses an unverified contact that exists', async () => {
      const unverified = 'chua.xac.minh@vidu-b07.test';
      const { customerId } = await seedLooseContact(context, {
        kind: 'EMAIL',
        value: unverified,
        verified: false,
        deactivated: false,
      });

      const response = await resolve({ contactKind: 'EMAIL', contact: unverified }).expect(404);

      // The row is there and belongs to a real Customer; the resolver still will
      // not name them, because an unverified contact has never proven reachable.
      expect(JSON.stringify(response.body)).not.toContain(customerId);
      bodiesOf.push(refusalOf(response));
    });

    it('refuses a deactivated contact that was once verified', async () => {
      const retired = 'da.ngung@vidu-b07.test';
      const { customerId } = await seedLooseContact(context, {
        kind: 'EMAIL',
        value: retired,
        verified: true,
        deactivated: true,
      });

      const response = await resolve({ contactKind: 'EMAIL', contact: retired }).expect(404);

      expect(JSON.stringify(response.body)).not.toContain(customerId);
      bodiesOf.push(refusalOf(response));
    });

    it('refuses a malformed contact with the same 404, not a shape error', async () => {
      await context.seedCustomer();

      // A 400 here would tell a caller that this value is malformed and some
      // other value is merely unknown — which is a fact about the other value.
      const response = await resolve({ contactKind: 'EMAIL', contact: 'not-an-address' }).expect(
        404,
      );

      bodiesOf.push(refusalOf(response));
    });

    it('gives byte-identical bodies for all four causes', () => {
      expect(bodiesOf).toHaveLength(4);
      expect(new Set(bodiesOf).size).toBe(1);
    });
  });

  describe('it cannot be made to search', () => {
    it('misses on a prefix, a fragment and a different domain', async () => {
      await context.seedCustomer();

      const local = FIXTURE_EMAIL.split('@')[0] ?? '';
      for (const attempt of [
        local,
        FIXTURE_EMAIL.slice(0, FIXTURE_EMAIL.length - 2),
        `${local}@vidu-other.test`,
        'vidu-b07.test',
      ]) {
        await resolve({ contactKind: 'EMAIL', contact: attempt }).expect(404);
      }
    });

    it('misses on a truncated, extended or neighbouring phone number', async () => {
      await context.seedCustomer();

      // Deliberately *not* `912345678` here: that is the national form of the
      // seeded number and normalizes to the same E.164 value, so it resolves —
      // which is exact matching doing its job, proved in the normalization case
      // above, not a prefix match. These three are different numbers.
      for (const attempt of ['+8491234567', '+849123456789', '+84912345670']) {
        await resolve({ contactKind: 'PHONE', contact: attempt }).expect(404);
      }
    });

    it('refuses a body that asks for a list, a page or a looser match', async () => {
      await context.seedCustomer();

      // `.strict()` is what stops a search parameter arriving unnoticed: a
      // dropped unknown key is how a caller believes it filtered something.
      for (const body of [
        { contactKind: 'EMAIL', contact: FIXTURE_EMAIL, limit: 10 },
        { contactKind: 'EMAIL', contact: FIXTURE_EMAIL, q: 'vidu' },
        { contactKind: 'EMAIL', contact: FIXTURE_EMAIL, includeUnverified: true },
        { contactKind: 'EMAIL', contact: FIXTURE_EMAIL, prefix: true },
      ]) {
        await resolve(body).expect(400);
      }
    });

    it('refuses a missing or unknown contact kind', async () => {
      await resolve({ contact: FIXTURE_EMAIL }).expect(400);
      await resolve({ contactKind: 'ADDRESS', contact: FIXTURE_EMAIL }).expect(400);
      await resolve({ contactKind: 'EMAIL' }).expect(400);
      await resolve({ contactKind: 'EMAIL', contact: '' }).expect(400);
    });
  });
});
