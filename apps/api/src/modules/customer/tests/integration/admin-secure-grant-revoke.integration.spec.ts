/**
 * `APP4-B07` — operator-initiated revocation, through the whole HTTP stack.
 *
 * The claims that matter here are the ones a unit test cannot make:
 *
 * - the transition really runs through `APP4-B05`, so its audit row exists and
 *   is attributed to the **authenticated** Admin rather than to the customer
 *   whose access was just removed;
 * - the link is dead the moment the call returns — proven by asking the
 *   repository's own live-grant resolver, not by re-reading `status`;
 * - a revocation mints nothing: no replacement grant, no token, no notification
 *   intent and no outbox event;
 * - a second revoke is a conflict that appends no second transition and no
 *   second audit row.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../../domain/repositories/secure-access-grant.repository';
import {
  ROUTES,
  createAdminSupportContext,
  type AdminSupportTestContext,
  type SeededCustomer,
  type SeededGrant,
} from './admin-support-context';

const FUTURE = new Date('2099-01-01T09:00:00.000Z');
const REASON = 'Customer reported the link was forwarded by mistake';

// A type alias rather than an interface: `db.execute<T>` constrains `T` to
// `Record<string, unknown>`, and only an object *type* gets TypeScript's
// implicit index signature.
type AuditRow = {
  readonly action: string;
  readonly actor_kind: string;
  readonly admin_id: string | null;
  readonly customer_id: string | null;
  readonly target_kind: string;
  readonly target_id: string;
  readonly reason: string | null;
  readonly summary: unknown;
};

describe('APP4-B07 Admin secure-grant revocation (integration)', () => {
  let context: AdminSupportTestContext;
  let grants: SecureAccessGrantRepository;

  beforeAll(async () => {
    context = await createAdminSupportContext('app4-b07-revoke');
    grants = context.get<SecureAccessGrantRepository>(SECURE_ACCESS_GRANT_REPOSITORY);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  async function seedActiveGrant(): Promise<{
    readonly customer: SeededCustomer;
    readonly grant: SeededGrant;
  }> {
    const customer = await context.seedCustomer();
    const grant = await context.seedGrant({
      customerId: customer.customerId,
      customRequestId: await context.seedRequest(customer.customerId),
      status: 'ACTIVE',
      expiresAt: FUTURE,
      marker: 'revocable',
    });
    return { customer, grant };
  }

  const revoke = (grantId: string, body: unknown) =>
    request(context.server())
      .post(ROUTES.revoke(grantId))
      .set('Cookie', context.adminCookie())
      .set('Content-Type', 'application/json')
      .send(body as object);

  async function auditRows(): Promise<readonly AuditRow[]> {
    const result = await context.disposable.client.db.execute<AuditRow>(
      sql`select action, actor_kind, admin_id, customer_id, target_kind, target_id, reason, summary
          from audit_events order by occurred_at, action`,
    );
    return result.rows;
  }

  async function grantRow(grantId: string): Promise<{
    status: string;
    revoke_reason: string | null;
    superseded_by_grant_id: string | null;
  }> {
    const result = await context.disposable.client.db.execute<{
      status: string;
      revoke_reason: string | null;
      superseded_by_grant_id: string | null;
    }>(
      sql`select status, revoke_reason, superseded_by_grant_id
          from secure_access_grants where id = ${grantId}`,
    );
    return result.rows[0] as never;
  }

  describe('the reason is mandatory', () => {
    it('refuses a missing reason and leaves the grant untouched', async () => {
      const { grant } = await seedActiveGrant();

      await revoke(grant.grantId, {}).expect(400);

      expect((await grantRow(grant.grantId)).status).toBe('ACTIVE');
      expect(await auditRows()).toHaveLength(0);
    });

    it('refuses a blank reason and leaves the grant untouched', async () => {
      const { grant } = await seedActiveGrant();

      await revoke(grant.grantId, { reason: '   ' }).expect(400);

      expect((await grantRow(grant.grantId)).status).toBe('ACTIVE');
      expect(await auditRows()).toHaveLength(0);
    });

    it('refuses a body carrying anything the operator does not own', async () => {
      const { grant, customer } = await seedActiveGrant();

      // `.strict()` — an accepted `actorId` would let an operator file their
      // action against a colleague, and an accepted `customerId` would let them
      // assert whose grant they were killing.
      await revoke(grant.grantId, { reason: REASON, actorId: newId() }).expect(400);
      await revoke(grant.grantId, { reason: REASON, customerId: customer.customerId }).expect(400);

      expect((await grantRow(grant.grantId)).status).toBe('ACTIVE');
    });
  });

  describe('a successful revocation', () => {
    it('moves ACTIVE to REVOKED, persists the reason and kills resolution', async () => {
      const { grant } = await seedActiveGrant();

      // The link is live before the call, asked through the repository's own
      // live-grant resolver rather than by reading `status`.
      await expect(
        grants.resolveActiveByTokenDigest(grant.tokenHash, 'REQUEST_ACCESS', new Date()),
      ).resolves.toBeDefined();

      await revoke(grant.grantId, { reason: REASON }).expect(204);

      const row = await grantRow(grant.grantId);
      expect(row.status).toBe('REVOKED');
      expect(row.revoke_reason).toBe(REASON);

      await expect(
        grants.resolveActiveByTokenDigest(grant.tokenHash, 'REQUEST_ACCESS', new Date()),
      ).resolves.toBeUndefined();
    });

    it('writes one B05 audit row attributed to the authenticated Admin', async () => {
      const { grant, customer } = await seedActiveGrant();

      await revoke(grant.grantId, { reason: REASON }).expect(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      const [event] = rows;
      expect(event?.action).toBe('secure_grant.revoked');
      expect(event?.target_kind).toBe('SECURE_ACCESS_GRANT');
      expect(event?.target_id).toBe(grant.grantId);
      expect(event?.reason).toBe(REASON);

      // The whole point of §14: an Admin action must not claim CUSTOMER or
      // SYSTEM, and the admin id must be the session's, not a fixture's.
      expect(event?.actor_kind).toBe('ADMIN');
      expect(event?.admin_id).toBe(context.adminId());
      expect(event?.customer_id).toBeNull();
      expect(event?.admin_id).not.toBe(customer.customerId);
    });

    it('mints no replacement grant, no token and no notification', async () => {
      const { grant, customer } = await seedActiveGrant();

      await revoke(grant.grantId, { reason: REASON }).expect(204);

      const all = await context.disposable.client.db.execute<{ id: string }>(
        sql`select id from secure_access_grants where customer_id = ${customer.customerId}`,
      );
      expect(all.rows).toHaveLength(1);
      expect((await grantRow(grant.grantId)).superseded_by_grant_id).toBeNull();

      for (const table of ['notification_intents', 'outbox_events']) {
        const count = await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${sql.raw(table)}`,
        );
        expect(count.rows[0]?.count).toBe('0');
      }
    });

    it('carries no token or digest in the response or the audit row', async () => {
      const { grant } = await seedActiveGrant();

      const response = await revoke(grant.grantId, { reason: REASON }).expect(204);

      expect(response.text).toBe('');
      const serialized = JSON.stringify(await auditRows());
      expect(serialized).not.toContain(grant.tokenHash);
      expect(serialized.toLowerCase()).not.toContain('token');
      expect(serialized.toLowerCase()).not.toContain('digest');
    });
  });

  describe('conflicts and unknown ids', () => {
    it('answers 404 for an unknown grant and writes nothing', async () => {
      await revoke(newId(), { reason: REASON }).expect(404);

      expect(await auditRows()).toHaveLength(0);
    });

    it('answers 409 on a second revoke and appends no second transition', async () => {
      const { grant } = await seedActiveGrant();

      await revoke(grant.grantId, { reason: REASON }).expect(204);
      const afterFirst = await grantRow(grant.grantId);

      await revoke(grant.grantId, { reason: 'a different reason' }).expect(409);

      // The reason from the first, winning revoke survives: the second call
      // changed no column, and LC-03 has no REVOKED → REVOKED edge.
      expect(await grantRow(grant.grantId)).toEqual(afterFirst);
      expect(await auditRows()).toHaveLength(1);
    });

    it('answers 409 for a grant that is already EXPIRED', async () => {
      const customer = await context.seedCustomer();
      const expired = await context.seedGrant({
        customerId: customer.customerId,
        customRequestId: await context.seedRequest(customer.customerId),
        status: 'EXPIRED',
        expiresAt: new Date('2026-08-01T09:00:00.000Z'),
        marker: 'expired',
      });

      await revoke(expired.grantId, { reason: REASON }).expect(409);

      expect((await grantRow(expired.grantId)).status).toBe('EXPIRED');
      expect(await auditRows()).toHaveLength(0);
    });

    it('answers 400 for a malformed grant id', async () => {
      await revoke('not-a-uuid', { reason: REASON }).expect(400);
    });
  });
});
