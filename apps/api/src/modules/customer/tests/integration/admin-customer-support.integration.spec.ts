/**
 * `APP4-B07` — Admin authentication and the Customer support read, through the
 * whole HTTP stack against a real PostgreSQL instance.
 *
 * Two claims live here and nowhere else in this checkpoint:
 *
 * 1. **All three routes are behind APP1's existing guard.** No cookie is a 401,
 *    and an invalid cookie is a 401, through the real
 *    `AuthenticatedAdminGuard` — not a stub. This is not a re-run of APP1's auth
 *    matrix (that suite owns expiry, revocation, sliding renewal and disabled
 *    accounts); it is the one thing only B07 can prove, which is that its own
 *    routes are attached to that guard at all.
 * 2. **A contact leaves this API masked or not at all.** The response is
 *    searched for the raw address, the normalized address and the E.164 number
 *    as whole strings — an assertion on the mask alone would still pass if the
 *    raw value were sitting in a second field.
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
  createAdminSupportContext,
  type AdminSupportTestContext,
} from './admin-support-context';

/** The published support projection, as the wire carries it. */
interface Detail {
  readonly customerId: string;
  readonly verifiedAt: string;
  readonly contacts: readonly {
    readonly kind: string;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}

describe('APP4-B07 Admin customer support (integration)', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app4-b07-customer');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  describe('Admin authentication', () => {
    it('refuses every route with no Admin session', async () => {
      const customerId = newId();
      const grantId = newId();

      await request(context.server()).get(ROUTES.detail(customerId)).expect(401);
      await request(context.server()).get(ROUTES.grants(customerId)).expect(401);
      await request(context.server())
        .post(ROUTES.revoke(grantId))
        .set('Content-Type', 'application/json')
        .send({ reason: 'compromised link' })
        .expect(401);
    });

    it('refuses every route with a cookie that resolves to no session', async () => {
      // One representative invalid-session case. APP1 owns expiry, revocation
      // and disabled-account handling, and the guard code is unchanged here, so
      // re-running that matrix would prove APP1 again rather than B07.
      const cookie = `${ADMIN_COOKIE_NAME}=not-a-live-session-token`;
      const customerId = newId();

      await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', cookie)
        .expect(401);
      await request(context.server())
        .get(ROUTES.grants(customerId))
        .set('Cookie', cookie)
        .expect(401);
      await request(context.server())
        .post(ROUTES.revoke(newId()))
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .send({ reason: 'compromised link' })
        .expect(401);
    });

    it('reaches the handler with a live Admin session', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(dataOf<Detail>(response).customerId).toBe(customerId);
    });
  });

  describe('GET /admin/customers/{customerId}', () => {
    it('reports the verification fact, both contact kinds and exactly one primary', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const data = dataOf<Detail>(response);
      expect(data.customerId).toBe(customerId);
      // A Customer exists only verified, so the instant's presence is the fact.
      expect(new Date(data.verifiedAt).toISOString()).toBe('2026-08-14T09:00:00.000Z');

      expect(data.contacts).toHaveLength(2);
      expect(data.contacts.map((contact) => contact.kind).sort()).toEqual(['EMAIL', 'PHONE']);
      expect(data.contacts.filter((contact) => contact.primary)).toHaveLength(1);
      expect(data.contacts.every((contact) => contact.verified)).toBe(true);
    });

    it('publishes the APP4-P01 mask for EMAIL and PHONE, and no other form', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const byKind = new Map(
        dataOf<Detail>(response).contacts.map((contact) => [contact.kind, contact]),
      );
      expect(byKind.get('EMAIL')?.maskedValue).toBe(FIXTURE_EMAIL_MASK);
      expect(byKind.get('PHONE')?.maskedValue).toBe(FIXTURE_PHONE_MASK);

      // The mask must differ from its input, or it is not a mask.
      expect(FIXTURE_EMAIL_MASK).not.toBe(FIXTURE_EMAIL);
      expect(FIXTURE_PHONE_MASK).not.toBe(FIXTURE_PHONE);

      // Searched over the whole serialized body, not field by field: a raw value
      // in a field nobody thought to assert on is exactly the leak this catches.
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_PHONE);
      expect(body).not.toContain('912345678');
    });

    it('omits Business Profile, merge history and every credential field', async () => {
      const { customerId } = await context.seedCustomer();

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const data = dataOf<Detail>(response);
      expect(Object.keys(data).sort()).toEqual(['contacts', 'customerId', 'verifiedAt']);
      expect(Object.keys(data.contacts[0] ?? {}).sort()).toEqual([
        'kind',
        'maskedValue',
        'primary',
        'verified',
      ]);

      const body = JSON.stringify(response.body).toLowerCase();
      for (const forbidden of [
        'businessprofile',
        'companyname',
        'taxcode',
        'mergedinto',
        'anonymized',
        'normalizedvalue',
        'displayvalue',
        'verifiedsource',
        'tokenhash',
        'token_hash',
        'digest',
        'ciphertext',
        'password',
        'session',
        'notification',
      ]) {
        expect(body).not.toContain(forbidden);
      }
    });

    it('lists current contacts only and keeps the primary first', async () => {
      const { customerId, phoneContactId } = await context.seedCustomer();
      // A deactivated historical contact. `listContactPoints` returns it;
      // B07 must not, and ADR-DB2-003 r7 is why.
      await context.disposable.client.db.execute(
        sql`update customer_contact_points set deactivated_at = now() where id = ${phoneContactId}`,
      );

      const response = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      const data = dataOf<Detail>(response);
      expect(data.contacts).toHaveLength(1);
      expect(data.contacts[0]?.kind).toBe('EMAIL');
      expect(data.contacts[0]?.primary).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain(FIXTURE_PHONE_MASK);
    });

    it('answers 404 for an unknown Customer', async () => {
      await request(context.server())
        .get(ROUTES.detail(newId()))
        .set('Cookie', context.adminCookie())
        .expect(404);
    });

    it('answers 400 for a malformed customer id', async () => {
      await request(context.server())
        .get(ROUTES.detail('not-a-uuid'))
        .set('Cookie', context.adminCookie())
        .expect(400);
    });

    it('forbids caching on both reads', async () => {
      const { customerId } = await context.seedCustomer();

      const detail = await request(context.server())
        .get(ROUTES.detail(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);
      const grants = await request(context.server())
        .get(ROUTES.grants(customerId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(detail.headers['cache-control']).toBe('no-store');
      expect(grants.headers['cache-control']).toBe('no-store');
    });
  });
});
