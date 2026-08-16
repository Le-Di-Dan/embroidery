/**
 * `APP5-B02` §12 — the one interoperability claim: an image this checkpoint
 * uploads can actually be submitted.
 *
 * The COP branch is the proof deliberately chosen. `APP5-G01 D10` requires at
 * least one `COP_IMAGE` on a customer-owned-product request, and until this
 * checkpoint nothing in the system could produce one — so the entire COP
 * journey was unsubmittable end to end. That is the gap being closed, and a
 * `REFERENCE` upload on the catalog branch would not close it.
 *
 * Nothing here fakes the middle. The asset is created by the real intake
 * service, moved to `ACCEPTED` the way the inspector moves it, and handed to
 * the real `SubmitCustomRequestUseCase`. The negative case is the same path
 * with the asset left `INSPECTING`, which is what proves the binder is still
 * the authority rather than a formality this lane bypassed.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OBJECT_STORAGE } from '../../../asset/infrastructure/storage/object-storage.provider';
import { SECURE_GRANT_POLICY_KEY } from '../../../customer/domain/grant/secure-grant-policy';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import { CustomRequestIntakeModule } from '../../custom-request-intake.module';
import { CustomRequestSubmissionModule } from '../../custom-request-submission.module';
import { RequestAssetIntakeService } from '../../application/intake/request-asset-intake.service';
import { SubmitCustomRequestUseCase } from '../../application/submit-custom-request.use-case';
import { RequestSubmissionError } from '../../domain/submission/request-submission.errors';
import { multipartRequest, pngBytes, RecordingObjectStorage } from './request-intake-context';

/**
 * Synthetic secrets, generated per run.
 *
 * `CustomRequestSubmissionModule` pulls in Design and Customer, which fail
 * fast without their peppers and envelope key — the same rule the APP4 suites
 * satisfy. A checked-in value would be a credential in the repository whether
 * or not anything real is sealed under it, so each is random and none is a
 * value any environment uses.
 */
const SYNTHETIC_SECRET_ENV: Readonly<Record<string, string>> = {
  DESIGN_SESSION_SECRET_PEPPER: `design-${randomBytes(24).toString('hex')}`,
  VERIFICATION_CODE_SECRET_PEPPER: `code-${randomBytes(24).toString('hex')}`,
  SECURE_LINK_TOKEN_SECRET_PEPPER: `link-${randomBytes(24).toString('hex')}`,
  NOTIFICATION_DELIVERY_ENVELOPE_KEY: randomBytes(32).toString('base64'),
};

const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app5-offline.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app5-offline',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app5-offline',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app5-offline-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app5-offline-derivatives',
};

/** The `APP4-G01` values, as published. Restated by no production file. */
const GRANT_POLICY = { standardTtlSeconds: 604_800, stepUpWindowSeconds: 900 };

const COP = {
  name: 'Customer jacket',
  description: 'A jacket the customer already owns.',
  // Decimal strings, not numbers: the persisted columns are NUMERIC and the
  // contract carries them as text so no value is rounded on the way in.
  physicalWidthMm: '400.00',
  physicalHeightMm: '600.00',
};

describe('APP5-B02 → APP5-B01 COP binding (integration)', () => {
  let context: PersistenceTestContext;
  let intake: RequestAssetIntakeService;
  let submission: SubmitCustomRequestUseCase;
  let storage: RecordingObjectStorage;
  let restoreEnv: () => void;

  /**
   * Runs `work` with a request context bound, as an HTTP request would.
   *
   * `TR-LC11-01` records an audit event for the grant it issues, and audit
   * correlation is NOT NULL — so a submission outside a request context is not
   * a case production can reach, and faking one would be testing a path that
   * does not exist.
   */
  const inRequest = <T>(work: () => Promise<T>): Promise<T> =>
    context
      .get<RequestContextService>(RequestContextService)
      .run({ requestId: `app5-b02-${newId()}` }, work);

  beforeAll(async () => {
    const previous = new Map<string, string | undefined>();
    for (const [name, value] of Object.entries({
      ...OFFLINE_STORAGE_ENV,
      ...SYNTHETIC_SECRET_ENV,
    })) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
    restoreEnv = (): void => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    };

    storage = new RecordingObjectStorage();
    context = await createPersistenceTestContext(
      'app5-b02-binding',
      [
        RequestContextModule,
        AuditContextModule,
        CustomRequestIntakeModule,
        CustomRequestSubmissionModule,
      ],
      (builder) => builder.overrideProvider(OBJECT_STORAGE).useValue(storage),
    );
    intake = context.get<RequestAssetIntakeService>(RequestAssetIntakeService);
    submission = context.get<SubmitCustomRequestUseCase>(SubmitCustomRequestUseCase);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
    restoreEnv?.();
  });

  beforeEach(async () => {
    await context.reset();
    storage.reset();
    // `TR-LC11-01` issues a `REQUEST_ACCESS` grant, which fails closed without
    // its published policy. Republished after every truncate because the policy
    // lives in the database, exactly as production reads it.
    await publishGrantPolicy();
  });

  /** Publishes `secure_grant` through its canonical versioned path. */
  async function publishGrantPolicy(): Promise<void> {
    const db = context.disposable.client.db;
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`app5-b02-${adminId}@example.test`}, 'APP5 Fixture Admin', 'ACTIVE')
    `);
    const policies = context.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    await context.inTransaction(async () => {
      await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'Secure grant policy (APP4-G01).');
      await policies.publishVersion({
        configKey: SECURE_GRANT_POLICY_KEY,
        value: GRANT_POLICY,
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP5-B02 interoperability fixture.',
      });
    });
  }

  /** One verified customer with a live `SUBMISSION` challenge. */
  async function seedChallenge(): Promise<string> {
    const db = context.disposable.client.db;
    const challengeId = newId();
    const customerId = newId();
    const contactPointId = newId();
    const normalized = `binding-${challengeId}@example.test`;

    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'APP5 Binding Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value,
         is_primary, verified_at, verified_source)
      values (${contactPointId}, ${customerId}, 'EMAIL', ${normalized}, ${normalized},
              true, now(), 'OTP')
    `);
    await db.execute(sql`
      insert into contact_verification_challenges
             (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, 'EMAIL', ${normalized}, 'SUBMISSION', ${`hash-${challengeId}`},
              'VERIFIED', now() + interval '30 minutes', now())
    `);
    return challengeId;
  }

  async function uploadCopImage(challengeId: string): Promise<string> {
    const view = await intake.upload(multipartRequest(pngBytes()), {
      challengeId: challengeId as ChallengeId,
      role: 'COP_IMAGE',
    });
    return view.assetId;
  }

  /** What the inspector does on acceptance, and nothing more. */
  async function accept(assetId: string): Promise<void> {
    await context.disposable.client.db.execute(
      sql`update assets set status = 'ACCEPTED', updated_at = now() where id = ${assetId}`,
    );
  }

  it('binds a B02 COP_IMAGE into a customer-owned-product submission', async () => {
    const challengeId = await seedChallenge();
    const assetId = await uploadCopImage(challengeId);
    await accept(assetId);

    const result = await inRequest(() =>
      submission.submit({
        challengeId,
        subject: { customerOwnedProduct: COP },
        breakdown: [{ sizeLabel: 'M', quantity: 2 }],
        assets: [{ assetId, role: 'COP_IMAGE' }],
      }),
    );

    expect(result.status).toBe('NEW');

    const binding = await context.disposable.client.db.execute<{
      custom_request_id: string;
      role: string;
    }>(sql`select custom_request_id, role from custom_request_assets where asset_id = ${assetId}`);
    expect(binding.rows).toHaveLength(1);
    expect(binding.rows[0]?.custom_request_id).toBe(result.requestId);
    expect(binding.rows[0]?.role).toBe('COP_IMAGE');

    // The provenance survives the binding: the same row still carries the
    // challenge that authorized it, which is what the cleanup sweep and any
    // later audit read.
    const asset = await context.disposable.client.db.execute<{
      uploaded_via_challenge_id: string | null;
      intake_expires_at: Date | null;
    }>(sql`select uploaded_via_challenge_id, intake_expires_at from assets where id = ${assetId}`);
    expect(asset.rows[0]?.uploaded_via_challenge_id).toBe(challengeId);
    expect(asset.rows[0]?.intake_expires_at).not.toBeNull();
  });

  it('refuses to bind the same upload while it is still INSPECTING', async () => {
    const challengeId = await seedChallenge();
    const assetId = await uploadCopImage(challengeId);

    // Not accepted. The binder — not this lane — is the authority on what is
    // bindable, and B02 does not get to short-circuit it.
    await expect(
      inRequest(() =>
        submission.submit({
          challengeId,
          subject: { customerOwnedProduct: COP },
          breakdown: [{ sizeLabel: 'M', quantity: 1 }],
          assets: [{ assetId, role: 'COP_IMAGE' }],
        }),
      ),
    ).rejects.toThrow(RequestSubmissionError);

    const binding = await context.disposable.client.db.execute<{ n: number }>(
      sql`select count(*)::int as n from custom_request_assets`,
    );
    expect(binding.rows[0]?.n).toBe(0);
  });

  it('refuses to bind an accepted upload made under a different challenge', async () => {
    const mine = await seedChallenge();
    const theirs = await seedChallenge();
    const assetId = await uploadCopImage(theirs);
    await accept(assetId);

    // Different challenge means a different resolved customer, and the binder
    // compares `uploaded_by_customer_id` against the submission's own.
    await expect(
      inRequest(() =>
        submission.submit({
          challengeId: mine,
          subject: { customerOwnedProduct: COP },
          breakdown: [{ sizeLabel: 'M', quantity: 1 }],
          assets: [{ assetId, role: 'COP_IMAGE' }],
        }),
      ),
    ).rejects.toThrow(RequestSubmissionError);
  });
});
