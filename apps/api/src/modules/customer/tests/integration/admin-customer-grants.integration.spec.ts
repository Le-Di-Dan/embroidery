/**
 * `APP4-B07` — the Customer-scoped grant list, through the whole HTTP stack.
 *
 * The fixtures are the honest lifecycle, not a convenient one. LC-03 has no
 * background sweep, so a grant whose `expires_at` has passed is still stored as
 * `ACTIVE`; that row is seeded here on purpose, because a support screen that
 * hid it — or that rewrote its status to `EXPIRED` on the way out — would be
 * lying about what the database holds, and an operator comparing this screen
 * with the audit trail would find two different stories.
 *
 * What "still live" means is therefore derived by the reader from the pair
 * (`status`, `expiresAt`), and this suite asserts the pair is truthful for all
 * four states rather than asserting a server-computed boolean that does not
 * exist.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  ROUTES,
  SECOND_FIXTURE_EMAIL,
  SECOND_FIXTURE_PHONE,
  createAdminSupportContext,
  dataOf,
  type AdminSupportTestContext,
} from './admin-support-context';

const PAST = new Date('2026-08-01T09:00:00.000Z');
const FUTURE = new Date('2099-01-01T09:00:00.000Z');

interface GrantRow {
  readonly grantId: string;
  readonly customRequestId: string;
  readonly scopeKind: string;
  readonly status: string;
  readonly expiresAt: string;
}

describe('APP4-B07 Admin customer grants (integration)', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app4-b07-grants');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  /**
   * The subject customer with four grants covering every state the model can
   * hold, plus a second customer with one of its own.
   *
   * CST-009 admits one ACTIVE grant per (customer, request), so each grant gets
   * its own request row — which is also what production looks like.
   */
  async function seedLifecycle(): Promise<{
    readonly customerId: string;
    readonly otherCustomerId: string;
    readonly live: string;
    readonly staleActive: string;
    readonly revoked: string;
    readonly superseded: string;
    readonly foreign: string;
    readonly digests: readonly string[];
  }> {
    const { customerId } = await context.seedCustomer();
    const { customerId: otherCustomerId } = await context.seedCustomer({
      email: SECOND_FIXTURE_EMAIL,
      phone: SECOND_FIXTURE_PHONE,
    });

    const live = await context.seedGrant({
      customerId,
      customRequestId: await context.seedRequest(customerId),
      status: 'ACTIVE',
      expiresAt: FUTURE,
      marker: 'live',
    });
    // Physically ACTIVE, past its expiry. `resolveActive` refuses it by time;
    // no transition has run, and B07 must report exactly that.
    const staleActive = await context.seedGrant({
      customerId,
      customRequestId: await context.seedRequest(customerId),
      status: 'ACTIVE',
      expiresAt: PAST,
      marker: 'stale',
    });
    const revoked = await context.seedGrant({
      customerId,
      customRequestId: await context.seedRequest(customerId),
      status: 'REVOKED',
      expiresAt: FUTURE,
      marker: 'revoked',
      revokeReason: 'operator closed the ticket',
    });
    const supersededRequest = await context.seedRequest(customerId);
    const superseded = await context.seedGrant({
      customerId,
      customRequestId: supersededRequest,
      status: 'REVOKED',
      expiresAt: FUTURE,
      marker: 'superseded',
      revokeReason: 'superseded',
    });
    const replacement = await context.seedGrant({
      customerId,
      customRequestId: supersededRequest,
      status: 'ACTIVE',
      expiresAt: FUTURE,
      marker: 'replacement',
    });
    await context.disposable.client.db.execute(
      sql`update secure_access_grants set superseded_by_grant_id = ${replacement.grantId}
          where id = ${superseded.grantId}`,
    );

    const foreign = await context.seedGrant({
      customerId: otherCustomerId,
      customRequestId: await context.seedRequest(otherCustomerId),
      status: 'ACTIVE',
      expiresAt: FUTURE,
      marker: 'foreign',
    });

    return {
      customerId,
      otherCustomerId,
      live: live.grantId,
      staleActive: staleActive.grantId,
      revoked: revoked.grantId,
      superseded: superseded.grantId,
      foreign: foreign.grantId,
      digests: [
        live.tokenHash,
        staleActive.tokenHash,
        revoked.tokenHash,
        superseded.tokenHash,
        replacement.tokenHash,
        foreign.tokenHash,
      ],
    };
  }

  async function listGrants(customerId: string): Promise<{
    readonly grants: readonly GrantRow[];
    readonly raw: string;
  }> {
    const response = await request(context.server())
      .get(ROUTES.grants(customerId))
      .set('Cookie', context.adminCookie())
      .expect(200);
    return {
      grants: dataOf<{ readonly grants: readonly GrantRow[] }>(response).grants,
      raw: JSON.stringify(response.body),
    };
  }

  it('returns only the requested Customer’s grants', async () => {
    const seeded = await seedLifecycle();

    const { grants, raw } = await listGrants(seeded.customerId);

    const ids = grants.map((grant) => grant.grantId);
    expect(ids).toHaveLength(5);
    expect(ids).toEqual(
      expect.arrayContaining([seeded.live, seeded.staleActive, seeded.revoked, seeded.superseded]),
    );
    // The other Customer's grant is absent from the payload entirely, not merely
    // from the id list.
    expect(ids).not.toContain(seeded.foreign);
    expect(raw).not.toContain(seeded.foreign);
  });

  it('scopes the other Customer’s list to that Customer', async () => {
    const seeded = await seedLifecycle();

    const { grants } = await listGrants(seeded.otherCustomerId);

    expect(grants.map((grant) => grant.grantId)).toEqual([seeded.foreign]);
  });

  it('reports status and expiry truthfully, including a stale ACTIVE row', async () => {
    const seeded = await seedLifecycle();

    const { grants } = await listGrants(seeded.customerId);
    const byId = new Map(grants.map((grant) => [grant.grantId, grant]));

    const live = byId.get(seeded.live);
    expect(live?.status).toBe('ACTIVE');
    expect(new Date(live?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now());

    // The row LC-03 leaves behind: still ACTIVE, already past its deadline. The
    // pair is what makes "not live" derivable; the server invents no EXPIRED
    // transition and rewrites nothing.
    const stale = byId.get(seeded.staleActive);
    expect(stale?.status).toBe('ACTIVE');
    expect(new Date(stale?.expiresAt ?? 0).getTime()).toBeLessThan(Date.now());

    expect(byId.get(seeded.revoked)?.status).toBe('REVOKED');
    expect(byId.get(seeded.superseded)?.status).toBe('REVOKED');
    for (const grant of grants) {
      expect(grant.scopeKind).toBe('REQUEST_ACCESS');
    }
  });

  it('does not mutate any grant lifecycle when read', async () => {
    const seeded = await seedLifecycle();
    const before = await context.disposable.client.db.execute<{ id: string; status: string }>(
      sql`select id, status, updated_at from secure_access_grants order by id`,
    );

    await listGrants(seeded.customerId);
    await listGrants(seeded.customerId);

    const after = await context.disposable.client.db.execute<{ id: string; status: string }>(
      sql`select id, status, updated_at from secure_access_grants order by id`,
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('publishes no token, digest, recipient, notification or business content', async () => {
    const seeded = await seedLifecycle();

    const { grants, raw } = await listGrants(seeded.customerId);

    expect(Object.keys(grants[0] ?? {}).sort()).toEqual([
      'customRequestId',
      'expiresAt',
      'grantId',
      'scopeKind',
      'status',
    ]);

    // Every seeded digest, by value. The fixture markers are deliberately
    // distinctive so a partial leak could not hide behind a shared prefix.
    for (const digest of seeded.digests) {
      expect(raw).not.toContain(digest);
    }
    for (const forbidden of [
      'fixture-digest-marker',
      'tokenhash',
      'token_hash',
      'digest',
      'ciphertext',
      'recipient',
      'revokereason',
      'supersededby',
      'intent',
      'outbox',
      'attempt',
      'quotation',
      'payment',
    ]) {
      expect(raw.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('answers 404 for an unknown Customer rather than an empty list', async () => {
    await request(context.server())
      .get(ROUTES.grants(newId()))
      .set('Cookie', context.adminCookie())
      .expect(404);
  });

  it('returns an empty list for a Customer that has never had a grant', async () => {
    const { customerId } = await context.seedCustomer();

    const { grants } = await listGrants(customerId);

    expect(grants).toEqual([]);
  });
});
