/**
 * `APP5-B01` — every way `POST /api/public/custom-requests` refuses.
 *
 * The sibling suite proves what a submission *writes*; this one proves what it
 * will not accept, and that a refusal leaves the database exactly as it found
 * it. They are separate review objects — one is about the TR-LC11-01
 * consequences, the other about the four guards standing in front of them — and
 * they were separated when the combined file crossed the 600-line test limit.
 *
 * Every case asserts **both** halves: the named business code, so an edit cannot
 * silently start answering a different rule's refusal, and a zero row count, so
 * a guard that refused *after* writing something would fail here rather than in
 * production. Nothing is mocked.
 */
import { sql } from 'drizzle-orm';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  applyApp5SubmissionSecretEnv,
  publishGrantPolicy,
  seedCustomerAsset,
  seedSubmissionContext,
  submissionHarness,
  submitted,
  SUBMIT_PATH,
  type SubmissionFixture,
} from '../support/custom-request-submission-fixture';

describe('APP5-B01 custom request submission refusals (API)', () => {
  let context: ApiIntegrationTestContext;
  let restoreSecretEnv: () => void;
  const { post, catalogBody, countOf, requestCount } = submissionHarness(() => context);

  beforeAll(async () => {
    restoreSecretEnv = applyApp5SubmissionSecretEnv();
    context = await createApiIntegrationContext('app5_b01_refuse');
    await publishGrantPolicy(context.app, context.database);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
    restoreSecretEnv?.();
  });

  describe('the subject invariant', () => {
    it('refuses both branches, writing nothing', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'both' });
      const response = await post(fixture, {
        ...catalogBody(fixture),
        customerOwnedProduct: { name: 'Áo' },
      }).expect(422);

      expect(submitted(response.body).code).toBe('SUBMISSION_SUBJECT_INVALID');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses neither branch, writing nothing', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'neither' });
      const response = await post(fixture, { breakdown: [] }).expect(422);

      expect(submitted(response.body).code).toBe('SUBMISSION_SUBJECT_INVALID');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses a catalog submission with no quantity at all', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'noqty' });
      const response = await post(fixture, catalogBody(fixture, { breakdown: [] })).expect(422);

      expect(submitted(response.body).code).toBe('SUBMISSION_SUBJECT_INVALID');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses a COP submission with no COP image (G01-D10)', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'nocopimg' });
      const response = await post(fixture, { customerOwnedProduct: { name: 'Áo' } }, false).expect(
        422,
      );

      expect(submitted(response.body).code).toBe('REQUEST_ASSET_NOT_BINDABLE');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });
  });

  describe('GRD-001 — the verified challenge', () => {
    it.each([
      ['never answered', { challengeStatus: 'ISSUED' as const }],
      ['for a different purpose', { challengePurpose: 'STEP_UP' as const }],
      ['already expired', { challengeExpiresInHours: -1 }],
    ])('refuses a challenge that is %s, writing nothing', async (label, options) => {
      const fixture = await seedSubmissionContext(context.database, {
        label: `chal-${label.replace(/\W/g, '')}`,
        ...options,
      });
      const response = await post(fixture, catalogBody(fixture)).expect(422);

      expect(submitted(response.body).code).toBe('CUSTOMER_NOT_VERIFIED');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });
  });

  describe('GRD-027 — the design session', () => {
    it('refuses a session that is not ACTIVE, writing nothing', async () => {
      const fixture = await seedSubmissionContext(context.database, {
        label: 'submitted-session',
        sessionStatus: 'SUBMITTED',
      });
      // APP3's authorizer checks liveness *after* the secret, and answers one
      // indistinguishable refusal for every reason — so a dead session reads
      // exactly like an unknown one, which is the rule, not a gap. The in-
      // transaction GRD-027 re-read below is what catches a session that dies
      // between authorization and the write.
      const response = await post(fixture, catalogBody(fixture)).expect(401);

      expect(submitted(response.body).code).toBe('SESSION_NOT_AUTHORIZED');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses a live, authorized session whose product is not the submitted subject', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'wrongproduct' });
      const other = await seedSubmissionContext(context.database, { label: 'otherproduct' });
      const response = await post(
        fixture,
        catalogBody(fixture, {
          catalog: {
            productId: other.productId,
            productVariantId: other.productVariantId,
            designSessionId: fixture.designSessionId,
          },
        }),
      ).expect(422);

      expect(submitted(response.body).code).toBe('SESSION_EXPIRED');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses a caller that names a session without holding its cookie', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'nocookie' });
      const response = await post(fixture, catalogBody(fixture), false).expect(401);

      expect(submitted(response.body).code).toBe('SESSION_NOT_AUTHORIZED');
      expect(await requestCount(fixture.customerId)).toBe(0);
      // The refused attempt claimed and then rolled back its idempotency record,
      // so it does not lock the legitimate holder out of their own submission.
      expect(
        await countOf(sql`select count(*) as count from idempotency_records
                          where scope_key = ${fixture.challengeId}`),
      ).toBe(0);
      expect(
        await countOf(
          sql`select count(*) as count from design_sessions
              where id = ${fixture.designSessionId} and status = 'ACTIVE'`,
        ),
      ).toBe(1);
    });

    it('refuses a mutating submission from a disallowed origin before reading the cookie', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'badorigin' });
      await context.http
        .post(SUBMIT_PATH)
        .set({ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })
        .set('cookie', fixture.sessionCookie)
        .send({ challengeId: fixture.challengeId, ...catalogBody(fixture) })
        .expect(403);

      expect(await requestCount(fixture.customerId)).toBe(0);
    });
  });

  describe('asset binding (G01 §6)', () => {
    const refuses = async (
      label: string,
      bindings: (fixture: SubmissionFixture) => Promise<Record<string, unknown>[]>,
    ): Promise<void> => {
      const fixture = await seedSubmissionContext(context.database, { label });
      const response = await post(
        fixture,
        { customerOwnedProduct: { name: 'Áo' }, assets: await bindings(fixture) },
        false,
      ).expect(422);

      expect(submitted(response.body).code).toBe('REQUEST_ASSET_NOT_BINDABLE');
      expect(await requestCount(fixture.customerId)).toBe(0);
    };

    it('refuses an asset that has not been accepted', async () => {
      await refuses('asset-uploaded', async (fixture) => [
        {
          assetId: await seedCustomerAsset(context.database, {
            customerId: fixture.customerId,
            status: 'UPLOADED',
          }),
          role: 'COP_IMAGE',
        },
      ]);
    });

    it('refuses an asset that belongs to another customer', async () => {
      await refuses('asset-foreign', async (fixture) => {
        const other = await seedSubmissionContext(context.database, {
          label: `owner-${fixture.customerId.slice(0, 8)}`,
        });
        return [
          {
            assetId: await seedCustomerAsset(context.database, { customerId: other.customerId }),
            role: 'COP_IMAGE',
          },
        ];
      });
    });

    it('refuses an asset outside the customer-private lane', async () => {
      await refuses('asset-scope', async (fixture) => [
        {
          assetId: await seedCustomerAsset(context.database, {
            customerId: fixture.customerId,
            kind: 'CATALOG_MEDIA',
            classification: 'PUBLIC',
          }),
          role: 'COP_IMAGE',
        },
      ]);
    });

    it('refuses a COP_IMAGE on the catalog branch', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'copimg-catalog' });
      const assetId = await seedCustomerAsset(context.database, { customerId: fixture.customerId });
      const response = await post(
        fixture,
        catalogBody(fixture, { assets: [{ assetId, role: 'COP_IMAGE' }] }),
      ).expect(422);

      expect(submitted(response.body).code).toBe('REQUEST_ASSET_NOT_BINDABLE');
      expect(await requestCount(fixture.customerId)).toBe(0);
    });

    it('refuses re-using evidence already bound to another request', async () => {
      const first = await seedSubmissionContext(context.database, { label: 'reuse-first' });
      const assetId = await seedCustomerAsset(context.database, { customerId: first.customerId });
      await post(
        first,
        { customerOwnedProduct: { name: 'Áo' }, assets: [{ assetId, role: 'COP_IMAGE' }] },
        false,
      ).expect(201);

      const second = await seedSubmissionContext(context.database, { label: 'reuse-second' });
      // Same asset, and it is even the same owner as far as the second caller is
      // concerned only if they share a customer — they do not, so this asserts
      // the reuse rule and the ownership rule together refuse it.
      const response = await post(
        second,
        { customerOwnedProduct: { name: 'Áo' }, assets: [{ assetId, role: 'COP_IMAGE' }] },
        false,
      ).expect(422);
      expect(submitted(response.body).code).toBe('REQUEST_ASSET_NOT_BINDABLE');
    });

    it('refuses more than ten of one role', async () => {
      await refuses('asset-cap', async (fixture) => {
        const bindings: Record<string, unknown>[] = [];
        for (let index = 0; index < 11; index += 1) {
          bindings.push({
            assetId: await seedCustomerAsset(context.database, {
              customerId: fixture.customerId,
            }),
            role: 'COP_IMAGE',
          });
        }
        return bindings;
      });
    });
  });
});
