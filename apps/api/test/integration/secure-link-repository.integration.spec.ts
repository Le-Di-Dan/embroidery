/**
 * `APP4-B06` — the one read added to `SecureAccessGrantRepository`.
 *
 * A direct repository suite because the port and its Drizzle adapter changed
 * (§16). It exists for the predicates the HTTP surface cannot reach: a scope
 * mismatch is unrepresentable as a stored row — `GRANT_SCOPE_KINDS` has one
 * member and a CHECK enforces it — but it *is* expressible as an argument, and
 * that is where the predicate can actually be exercised.
 *
 * It also pins the shape of the read itself: digest in, one grant or nothing
 * out, no raw token anywhere in the signature, and no write.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../../src/modules/customer/domain/repositories/secure-access-grant.repository';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { applyApp4SecretEnv, expectedDigest, seedGrant } from '../support/secure-link-fixture';

/**
 * "Now", for reads that are not about expiry.
 *
 * Derived from the process clock rather than pinned to a literal instant: the
 * fixture stores `now() + interval` from the **database** clock, so a hard-coded
 * date would quietly become "after expiry" once the calendar passed it. The one
 * test that *is* about expiry derives both instants from the row it seeded.
 */
const NOW = new Date();

describe('APP4-B06 secure-grant token-digest read (repository)', () => {
  let context: ApiIntegrationTestContext;
  let grants: SecureAccessGrantRepository;
  let restoreSecretEnv: () => void;

  beforeAll(async () => {
    restoreSecretEnv = applyApp4SecretEnv();
    context = await createApiIntegrationContext('app4_b06_repository');
    grants = context.app.get<SecureAccessGrantRepository>(SECURE_ACCESS_GRANT_REPOSITORY);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
    restoreSecretEnv?.();
  });

  it('resolves a live grant and returns its persisted target', async () => {
    const seeded = await seedGrant(context.database, { label: 'repolive' });

    const grant = await grants.resolveActiveByTokenDigest(
      expectedDigest(seeded.token),
      ['REQUEST_ACCESS'],
      NOW,
    );

    // The binding comes back *from the row*: this is what makes a caller-supplied
    // target unnecessary, and therefore impossible to get wrong.
    expect(grant).toMatchObject({
      id: seeded.grantId,
      customerId: seeded.customerId,
      customRequestId: seeded.customRequestId,
      scopeKind: 'REQUEST_ACCESS',
    });
  });

  it('refuses a scope the grant does not carry', async () => {
    // The one place a scope mismatch is expressible. No row with another scope
    // can exist (`ck_secure_access_grants__scope_kind_allowed`), so the predicate
    // is exercised from the argument side instead of by corrupting the table.
    const seeded = await seedGrant(context.database, { label: 'reposcope' });

    const grant = await grants.resolveActiveByTokenDigest(
      expectedDigest(seeded.token),
      ['SOMETHING_ELSE' as 'REQUEST_ACCESS'],
      NOW,
    );

    expect(grant).toBeUndefined();
  });

  it.each([
    ['an unknown digest', async (): Promise<string> => Promise.resolve(`missing-${newId()}`)],
  ])('returns nothing for %s', async (_label, digestOf) => {
    expect(
      await grants.resolveActiveByTokenDigest(await digestOf(), ['REQUEST_ACCESS'], NOW),
    ).toBeUndefined();
  });

  it('returns nothing once the grant is past its expiry, with no sweep', async () => {
    const seeded = await seedGrant(context.database, { label: 'repoexpiry', expiresInHours: 1 });
    const digest = expectedDigest(seeded.token);

    // Both instants are derived from the row's own stored expiry, so this asserts
    // the predicate rather than the date the suite happens to run on.
    const before = new Date(seeded.expiresAt.getTime() - 1_000);
    const after = new Date(seeded.expiresAt.getTime() + 1_000);

    expect(
      await grants.resolveActiveByTokenDigest(digest, ['REQUEST_ACCESS'], before),
    ).toBeDefined();

    // One second later the same ACTIVE row stops resolving: expiry is enforced
    // on read, not by a background job.
    expect(
      await grants.resolveActiveByTokenDigest(digest, ['REQUEST_ACCESS'], after),
    ).toBeUndefined();
  });

  it.each([
    ['REVOKED', 'REVOKED'],
    ['EXPIRED', 'EXPIRED'],
  ])('returns nothing for a %s grant', async (_label, status) => {
    const seeded = await seedGrant(context.database, { label: `repo${status.toLowerCase()}` });
    await context.database.client.db.execute(sql`
      update secure_access_grants
      set status = ${status}, revoke_reason = 'fixture'
      where id = ${seeded.grantId}
    `);

    expect(
      await grants.resolveActiveByTokenDigest(
        expectedDigest(seeded.token),
        ['REQUEST_ACCESS'],
        NOW,
      ),
    ).toBeUndefined();
  });

  it('writes nothing', async () => {
    const seeded = await seedGrant(context.database, { label: 'repowrite' });
    const before = await snapshot(seeded.grantId);

    await grants.resolveActiveByTokenDigest(expectedDigest(seeded.token), ['REQUEST_ACCESS'], NOW);
    await grants.resolveActiveByTokenDigest(`missing-${newId()}`, ['REQUEST_ACCESS'], NOW);

    expect(await snapshot(seeded.grantId)).toEqual(before);
  });

  async function snapshot(grantId: string): Promise<Record<string, unknown> | undefined> {
    const result = await context.database.client.db.execute<Record<string, unknown>>(sql`
      select status, token_hash, expires_at, revoked_at, revoke_reason,
             superseded_by_grant_id, updated_at
      from secure_access_grants where id = ${grantId}
    `);
    return result.rows[0];
  }
});
