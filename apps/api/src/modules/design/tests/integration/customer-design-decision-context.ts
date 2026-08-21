/**
 * Shared harness for the `APP6-B11` customer design-decision suites.
 *
 * Boots the real `CustomerDesignDecisionModule` — real controller wiring, real
 * `AuthorizeSecureLink`, real `ReauthorizeSecureGrant`, real
 * `StepUpEvidenceResolver`, real AGG-10 and AGG-11 repositories, real
 * `EffectiveAgreementsReader`, real idempotency store, real audit repository and
 * real outbox — against a disposable database with every migration applied.
 *
 * **Nothing under test is overridden.** In particular the digest is the real
 * one: the suite mints a token, computes its digest with the same `digestSecret`
 * the resolver uses, and stores only the digest — so a test that passes proves
 * the peppered HMAC path, not a stubbed comparison. The agreement fixture runs
 * the delivered `PublishApp6AgreementsUseCase` against the committed dataset
 * rather than inserting rows, so what an approval is required to bind is what
 * the bootstrap actually publishes.
 *
 * The design fixture writes `design_cases` and `design_versions` directly, on
 * the reasoning `APP6-B10`'s context records: re-running `APP6-B08`'s create and
 * `APP6-B09`'s send would pull the APP1 guards, the freeze authority and a
 * second outbox writer into suites about a decision, and what a decision
 * consumes is the committed row state rather than the path that produced it.
 * Seeding directly is also the only way to stand up several of the negatives —
 * a `SUPERSEDED` version that is still the case's latest, a case pointer aimed
 * at a newer DRAFT — which no delivered route produces in one step. The race
 * suite is the deliberate exception and drives the real delivered use cases.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored on close. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * Test-only.
 */
import { createHash, randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { IdempotencyStore, PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { SECURE_GRANT_POLICY_KEY } from '../../../customer/domain/grant/secure-grant-policy';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import { PublishApp6AgreementsUseCase } from '../../../content/application/publish-app6-agreements.use-case';
import {
  AGREEMENT_REPOSITORY,
  type AgreementRepository,
  type AgreementVersionId,
} from '../../../content/domain/repositories/agreement.repository';
import { CustomerDesignDecisionModule } from '../../customer-design-decision.module';
import { ApproveDesignVersionUseCase } from '../../application/deciding/approve-design-version.use-case';
import { RequestDesignRevisionUseCase } from '../../application/deciding/request-design-revision.use-case';
import { EffectiveAgreementsReader } from '../../application/review/effective-agreements.reader';
import { DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY } from '../../domain/review/design-approval-agreements.policy';
// The fixture material — the Catalog chain, the COP labels and the document whose
// declared colours an approval freezes — lives beside this harness rather than in
// it. See `customer-design-seed-data.ts`.
import {
  COP_AREA_LABEL,
  COP_SIDE_LABEL,
  seedCatalogPlacement,
  catalogDocument,
} from './customer-design-seed-data';
import type { SeededPlacement } from './customer-design-seed-data';
export {
  COP_AREA_LABEL,
  COP_SIDE_LABEL,
  catalogDocument,
  EXPECTED_THREAD_COLORS,
} from './customer-design-seed-data';
export type { SeededPlacement } from './customer-design-seed-data';

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b11-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b11-test-secure-link-pepper-0002',
};

/** The step-up window every suite publishes unless it is testing the window. */
export const STEP_UP_WINDOW_SECONDS = 15 * 60;

/** The two types `app6-policy-configuration.seed.json` requires today. */
export const REQUIRED_AGREEMENT_TYPES = ['PAYMENT_POLICY', 'RETURN_POLICY'] as const;

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The request a decision is made against, and the live link that opens it. */
export interface SeededDecisionTarget {
  readonly requestId: string;
  readonly customerId: string;
  readonly contactPointId: string;
  readonly contactValue: string;
  readonly designCaseId: string;
  readonly token: string;
  readonly grantId: string;
  readonly quantityTotal: number;
  /** Present only on the customer-owned branch. */
  readonly customerOwnedProductId: string | undefined;
  readonly customerOwnedProductName: string | undefined;
}

export interface SeedTargetOptions {
  readonly requestStatus?: string;
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
  /** Seed a `STEP_UP` challenge this many seconds ago. Omit for none. */
  readonly stepUpVerifiedSecondsAgo?: number | undefined;
  /** The customer-owned branch, with its own product row and no Catalog subject. */
  readonly customerOwned?: boolean;
  readonly quantities?: readonly number[];
  readonly withDesignCase?: boolean;
  readonly customerId?: string;
}

export interface SeedVersionOptions {
  readonly designCaseId: string;
  readonly version?: number;
  readonly status?: string;
  readonly document?: unknown;
  readonly documentSchemaVersion?: number;
  readonly documentHash?: string;
  /** Omit for the customer-owned branch; CST-129 admits one or the other. */
  readonly placement?: SeededPlacement | undefined;
  readonly customerOwnedProductId?: string | undefined;
  readonly makeCurrent?: boolean;
}

/** One accepted term, in the shape the approval body carries. */
export interface SubmittedAgreement {
  readonly agreementVersionId: string;
  readonly contentHash: string;
}

export interface DesignDecisionTestContext extends PersistenceTestContext {
  readonly approval: ApproveDesignVersionUseCase;
  readonly revision: RequestDesignRevisionUseCase;
  readonly agreements: EffectiveAgreementsReader;
  readonly idempotency: IdempotencyStore;
  /** Runs `work` inside an async-local request context (the recorders need one). */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  publishPolicies(options?: {
    readonly stepUpWindowSeconds?: number;
    readonly requiredAgreementTypes?: readonly string[];
  }): Promise<void>;
  /** Runs the delivered bootstrap publisher with a real resolved Admin id. */
  publishAgreementContent(): Promise<void>;
  /** The exact effective set an approval must submit back. */
  effectiveAgreements(): Promise<SubmittedAgreement[]>;
  /**
   * Publishes a genuinely new version of one agreement type, superseding the
   * current one, and returns its id.
   *
   * Through the delivered AGG-21 repository rather than by editing rows: the
   * `0030` immutability trigger rejects an UPDATE touching a protected column on
   * a published `agreement_versions` row, which is the schema stating that
   * published terms are replaced and never rewritten. A fixture that worked
   * around it would be testing against a database state the platform cannot
   * reach.
   */
  publishSupersedingAgreement(agreementType: string): Promise<string>;
  seedPlacement(): Promise<SeededPlacement>;
  seedTarget(options?: SeedTargetOptions): Promise<SeededDecisionTarget>;
  seedVersion(options: SeedVersionOptions): Promise<string>;
  addStepUp(target: SeededDecisionTarget, verifiedSecondsAgo: number): Promise<string>;
  rows<T>(query: ReturnType<typeof sql>): Promise<T[]>;
  count(query: ReturnType<typeof sql>): Promise<number>;
}

export async function createDesignDecisionContext(
  label: string,
): Promise<DesignDecisionTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomerDesignDecisionModule,
  ]);
  const db = base.disposable.client.db;
  const requestContext = base.get<RequestContextService>(RequestContextService);

  /**
   * The suite's one Admin row. `uq_admin_accounts__status__active` permits a
   * single `ACTIVE` account, so every fixture reuses it rather than minting one
   * per call: two ACTIVE admins is not a bigger fixture, it is an invalid
   * database.
   */
  async function ensureAdmin(): Promise<string> {
    const { rows } = await db.execute<{ readonly id: string }>(sql`
      select id from admin_accounts where status = 'ACTIVE' limit 1
    `);
    const existing = rows[0]?.id;
    if (existing !== undefined) {
      return existing;
    }
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`app6-b11-${adminId}@example.test`}, 'APP6 B11 Admin', 'ACTIVE')
    `);
    return adminId;
  }

  return {
    ...base,
    approval: base.get<ApproveDesignVersionUseCase>(ApproveDesignVersionUseCase),
    revision: base.get<RequestDesignRevisionUseCase>(RequestDesignRevisionUseCase),
    agreements: base.get<EffectiveAgreementsReader>(EffectiveAgreementsReader),
    idempotency: base.get<IdempotencyStore>(IdempotencyStore),

    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app6-b11-${newId()}` }, work),

    publishPolicies: async (options = {}): Promise<void> => {
      const adminId = await ensureAdmin();
      const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
      const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
      await base.inTransaction(async () => {
        await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP6-B11 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
          value: { maxRequestsPerIpPerMinute: 600 },
          valueSchemaVersion: 1,
          effectiveFrom,
          createdByAdminId: adminId,
          reason: 'APP6-B11 suite fixture.',
        });
        await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP6-B11 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_GRANT_POLICY_KEY,
          value: {
            standardTtlSeconds: 7 * 24 * 60 * 60,
            stepUpWindowSeconds: options.stepUpWindowSeconds ?? STEP_UP_WINDOW_SECONDS,
          },
          valueSchemaVersion: 1,
          effectiveFrom,
          createdByAdminId: adminId,
          reason: 'APP6-B11 suite fixture.',
        });
        await policies.ensureKey(DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY, 'APP6-B11 suite fixture.');
        await policies.publishVersion({
          configKey: DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY,
          value: {
            requiredAgreementTypes: [
              ...(options.requiredAgreementTypes ?? REQUIRED_AGREEMENT_TYPES),
            ],
          },
          valueSchemaVersion: 1,
          effectiveFrom,
          createdByAdminId: adminId,
          reason: 'APP6-B11 suite fixture.',
        });
      });
    },

    publishAgreementContent: async (): Promise<void> => {
      const adminId = await ensureAdmin();
      await base.get<PublishApp6AgreementsUseCase>(PublishApp6AgreementsUseCase).publish(adminId);
    },

    effectiveAgreements: async (): Promise<SubmittedAgreement[]> => {
      // Read through the delivered reader, so a suite's "valid body" is by
      // construction the set the approval will require rather than a hand-built
      // list that could drift from the published dataset.
      const set = await base
        .get<EffectiveAgreementsReader>(EffectiveAgreementsReader)
        .requireEffectiveSet();
      return set.map((agreement) => ({
        agreementVersionId: agreement.agreementVersionId,
        contentHash: agreement.contentHash,
      }));
    },

    publishSupersedingAgreement: async (agreementType: string): Promise<string> => {
      const agreements = base.get<AgreementRepository>(AGREEMENT_REPOSITORY);
      return base.inTransaction(async () => {
        const container = await agreements.findByType(agreementType);
        if (container === undefined) {
          throw new Error(`No agreement container for ${agreementType}.`);
        }
        const versionId = newId() as AgreementVersionId;
        const content = `Điều khoản cập nhật (${randomBytes(4).toString('hex')}).`;
        await agreements.addVersion({
          id: versionId,
          agreementId: container.id,
          content,
          language: 'vi',
        });
        // The hash of the new text, computed the same way the bootstrap
        // publisher computes it — a published version with a hash that did not
        // describe its content would break the very binding this exists to test.
        const contentHash = `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
        await agreements.publishVersion(
          versionId,
          contentHash,
          new Date('2021-01-01T00:00:00.000Z'),
        );
        return versionId;
      });
    },

    seedPlacement: (): Promise<SeededPlacement> => seedCatalogPlacement(db),

    seedTarget: async (options = {}): Promise<SeededDecisionTarget> => {
      const customerId = options.customerId ?? newId();
      const contactPointId = newId();
      // Random rather than derived from the id, for the UUIDv7 reason above.
      const contactValue = `app6b11-${randomBytes(6).toString('hex')}@example.test`;

      if (options.customerId === undefined) {
        await db.execute(sql`
          insert into customers (id, display_name, verified_at)
          values (${customerId}, 'APP6 B11 Customer', now())
        `);
      }
      await db.execute(sql`
        insert into customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
           verified_at, verified_source)
        values (${contactPointId}, ${customerId}, 'EMAIL', ${contactValue},
                ${contactValue}, true, now(), 'APP6-B11 suite fixture.')
      `);

      const requestId = newId();
      const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
      await db.execute(sql`
        insert into custom_requests (id, code, customer_id, status)
        values (${requestId}, ${code}, ${customerId}, ${options.requestStatus ?? 'DESIGN_REVIEW'})
      `);

      // The quantity breakdown the Approval Snapshot freezes a total of. Seeded
      // as several lines on purpose: the port sums in SQL, and a single line
      // would let a bug that returns "the first line" pass.
      const quantities = options.quantities ?? [12, 8, 4];
      let quantityTotal = 0;
      for (const [index, quantity] of quantities.entries()) {
        quantityTotal += quantity;
        await db.execute(sql`
          insert into custom_request_quantity_breakdowns
            (id, custom_request_id, product_variant_id, size_label, quantity)
          values (${newId()}, ${requestId}, null, ${`SIZE-${index}`}, ${quantity})
        `);
      }

      let customerOwnedProductId: string | undefined;
      let customerOwnedProductName: string | undefined;
      if (options.customerOwned === true) {
        customerOwnedProductId = newId();
        customerOwnedProductName = 'Áo khoác của khách';
        await db.execute(sql`
          insert into customer_owned_products (id, custom_request_id, name, description)
          values (${customerOwnedProductId}, ${requestId}, ${customerOwnedProductName},
                  'Áo khoác denim khách gửi tới xưởng.')
        `);
      }

      let designCaseId = '';
      if (options.withDesignCase !== false) {
        designCaseId = newId();
        await db.execute(sql`
          insert into design_cases (id, custom_request_id) values (${designCaseId}, ${requestId})
        `);
        await db.execute(sql`
          update custom_requests set current_design_case_id = ${designCaseId}
           where id = ${requestId}
        `);
      }

      const token = mintToken();
      const grantId = newId();
      const grantStatus = options.grantStatus ?? 'ACTIVE';
      const grantExpiresAt = new Date(
        Date.now() + (options.grantExpiresInMinutes ?? 60 * 24 * 7) * 60_000,
      );
      await db.execute(sql`
        insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                          scope_kind, status, expires_at, revoked_at, revoke_reason)
        values (${grantId}, ${customerId}, ${requestId},
                ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
                'REQUEST_ACCESS', ${grantStatus}, ${grantExpiresAt},
                -- ck_secure_access_grants__revoke_reason_required: a revoked
                -- grant must say why, so the fixture cannot seed one that merely
                -- looks revoked.
                ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
                ${grantStatus === 'REVOKED' ? 'APP6-B11 suite fixture.' : null})
      `);

      const target: SeededDecisionTarget = {
        requestId,
        customerId,
        contactPointId,
        contactValue,
        designCaseId,
        token,
        grantId,
        quantityTotal,
        customerOwnedProductId,
        customerOwnedProductName,
      };

      if (options.stepUpVerifiedSecondsAgo !== undefined) {
        await insertStepUp(target, options.stepUpVerifiedSecondsAgo);
      }
      return target;
    },

    seedVersion: async (options): Promise<string> => {
      const versionId = newId();
      const status = options.status ?? 'SENT_FOR_REVIEW';
      // CST-074: a version that has left DRAFT must carry a hash, and one that
      // has been sent must carry an instant, so a seeded `SENT_FOR_REVIEW` row
      // is a row the database would actually have accepted.
      const sent = status !== 'DRAFT';
      const documentHash = options.documentHash ?? (sent ? `sha256:${'a'.repeat(64)}` : null);
      const sentAt = sent ? new Date() : null;
      const cop = options.customerOwnedProductId;
      // Each terminal state carries the evidence its own CHECK requires:
      // CST-074 wants a hash once a row leaves DRAFT,
      // `ck_design_versions__void_reason_required` wants a reason on VOID, and
      // the approved/superseded instants belong with their statuses. Seeding
      // them keeps every fixture row one the database would actually have
      // accepted — a row that only *looks* like the state under test would make
      // the negative it drives worthless.
      const approvedAt = status === 'APPROVED' ? new Date() : null;
      const supersededAt = status === 'SUPERSEDED' ? new Date() : null;
      const voidReason = status === 'VOID' ? 'APP6-B11 suite fixture.' : null;
      const voidedAt = status === 'VOID' ? new Date() : null;

      await db.execute(sql`
        insert into design_versions
          (id, design_case_id, version, status, design_document, document_schema_version,
           document_hash, sent_at, approved_at, superseded_at, voided_at, void_reason,
           product_id, product_variant_id, product_side_id,
           embroidery_area_id, customer_owned_product_id, placement_side_label,
           placement_area_label, physical_width_mm, physical_height_mm)
        values (${versionId}, ${options.designCaseId}, ${options.version ?? 1}, ${status},
                ${JSON.stringify(options.document ?? catalogDocument())}::jsonb,
                ${options.documentSchemaVersion ?? 1}, ${documentHash}, ${sentAt},
                ${approvedAt}, ${supersededAt}, ${voidedAt}, ${voidReason},
                ${options.placement?.productId ?? null},
                ${options.placement?.productVariantId ?? null},
                ${options.placement?.productSideId ?? null},
                ${options.placement?.embroideryAreaId ?? null},
                ${cop ?? null},
                ${cop === undefined ? null : COP_SIDE_LABEL},
                ${cop === undefined ? null : COP_AREA_LABEL},
                '120.00', '80.00')
      `);
      if (options.makeCurrent === true) {
        await db.execute(sql`
          update design_cases set current_version_id = ${versionId}
           where id = ${options.designCaseId}
        `);
      }
      return versionId;
    },

    addStepUp: (target, verifiedSecondsAgo): Promise<string> =>
      insertStepUp(target, verifiedSecondsAgo),

    rows: async <T>(query: ReturnType<typeof sql>): Promise<T[]> =>
      (await db.execute(query)).rows as T[],

    count: async (query: ReturnType<typeof sql>): Promise<number> => {
      const [row] = (await db.execute(query)).rows as { readonly count: string }[];
      return Number(row?.count ?? '0');
    },

    close: async (): Promise<void> => {
      await base.close();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };

  async function insertStepUp(
    target: SeededDecisionTarget,
    verifiedSecondsAgo: number,
  ): Promise<string> {
    const challengeId = newId();
    const verifiedAt = new Date(Date.now() - verifiedSecondsAgo * 1_000);
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
         status, expires_at, verified_at)
      values (${challengeId}, ${target.contactPointId}, 'EMAIL',
              ${target.contactValue}, 'STEP_UP',
              -- A synthetic digest. No real code is minted, hashed or stored:
              -- the approval path never reads it, and a test must not put a
              -- credential-shaped value anywhere durable.
              ${`test-step-up-digest-${challengeId}`},
              'VERIFIED', ${new Date(verifiedAt.getTime() + 600_000)}, ${verifiedAt})
    `);
    return challengeId;
  }
}
