/**
 * Shared harness for the `APP6-B05` customer quotation-decision suites.
 *
 * Boots the real `CustomerQuotationDecisionModule` — real use cases, real
 * `AuthorizeSecureLink` and `ReauthorizeSecureGrant`, real
 * `StepUpEvidenceResolver`, real AGG-14 repository, real Ordering repository,
 * real `IdempotencyStore`, real audit repository — against a disposable database
 * with every migration applied.
 *
 * **Nothing under test is overridden.** The digest is the real one: the suite
 * mints a token, computes its digest with the same `digestSecret` the resolvers
 * use, and stores only the digest — so a test that passes proves the peppered
 * HMAC path, not a stubbed comparison. The step-up window is the real published
 * `secure_grant` policy, so a suite that wants a *lapsed* step-up expresses it by
 * back-dating `verified_at`, not by stubbing the reader.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored on close. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * The send fixture writes the three rows `APP6-B03` commits — the frozen
 * version, `quotations.current_version_id` and
 * `custom_requests.current_quotation_id` — through the delivered repository and
 * one pointer statement, in one transaction. It does not re-run the send use
 * case: that would pull the APP1 guards, the validity policy and the outbox into
 * suites about a decision, and what a decision consumes is the committed pointer
 * state, not the path that produced it.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

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
import { CustomerQuotationDecisionModule } from '../../customer-quotation-decision.module';
import { AcceptQuotationUseCase } from '../../application/customer/accept-quotation.use-case';
import { RejectQuotationUseCase } from '../../application/customer/reject-quotation.use-case';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { draftInput, type PricedVersionOptions } from './customer-quotation-context';

export { draftInput, mintToken, callerFrom } from './customer-quotation-context';
export type { PricedVersionOptions } from './customer-quotation-context';

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b05-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b05-test-secure-link-pepper-0002',
};

/** The published step-up window every suite runs against, unless it says otherwise. */
export const STEP_UP_WINDOW_SECONDS = 15 * 60;

export interface SeededCustomer {
  readonly customerId: string;
  readonly contactPointId: string;
  readonly contactKind: string;
  readonly normalizedValue: string;
}

export interface SeededDecisionTarget extends SeededCustomer {
  readonly requestId: string;
  readonly token: string;
  readonly grantId: string;
  readonly quotationId: QuotationId;
  readonly versionId: QuotationVersionId;
}

export interface SeedTargetOptions {
  readonly requestStatus?: string;
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
  readonly priced?: PricedVersionOptions;
  /** Sent this long ago; the window closes `validityMinutes` after that. */
  readonly sentMinutesAgo?: number;
  readonly validityMinutes?: number;
  /** Absent means no step-up at all — the GRD-003 refusal path. */
  readonly stepUpVerifiedSecondsAgo?: number | undefined;
}

export interface QuotationDecisionTestContext extends PersistenceTestContext {
  readonly acceptance: AcceptQuotationUseCase;
  readonly rejection: RejectQuotationUseCase;
  readonly quotations: QuotationRepository;
  readonly idempotency: IdempotencyStore;
  /** Runs `work` inside an async-local request context (audit + transitions need one). */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  publishPolicies(stepUpWindowSeconds?: number): Promise<void>;
  seedTarget(options?: SeedTargetOptions): Promise<SeededDecisionTarget>;
  /** Adds a further DRAFT version and sends it, superseding the current one. */
  sendNewerVersion(target: SeededDecisionTarget, unitPrice: number): Promise<QuotationVersionId>;
  addStepUp(customer: SeededCustomer, verifiedSecondsAgo: number): Promise<string>;
  revokeGrant(grantId: string): Promise<void>;
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
  count(query: ReturnType<typeof sql>): Promise<number>;
}

export async function createQuotationDecisionContext(
  label: string,
): Promise<QuotationDecisionTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomerQuotationDecisionModule,
  ]);
  const db = base.disposable.client.db;
  const quotations = base.get<QuotationRepository>(QUOTATION_REPOSITORY);
  const requestContext = base.get<RequestContextService>(RequestContextService);

  /**
   * The suite's one Admin row. `uq_admin_accounts__status__active` permits a
   * single `ACTIVE` account, so the policy fixture reuses it rather than minting
   * one per call: two ACTIVE admins is not a bigger fixture, it is an invalid
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
      values (${adminId}, ${`app6-b05-${adminId}@example.test`}, 'APP6 B05 Admin', 'ACTIVE')
    `);
    return adminId;
  }

  async function addStepUp(customer: SeededCustomer, verifiedSecondsAgo: number): Promise<string> {
    const challengeId = newId();
    const verifiedAt = new Date(Date.now() - verifiedSecondsAgo * 1_000);
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
         status, expires_at, verified_at)
      values (${challengeId}, ${customer.contactPointId}, ${customer.contactKind},
              ${customer.normalizedValue}, 'STEP_UP',
              -- A synthetic digest. No real code is minted, hashed or stored:
              -- the acceptance path never reads it, and a test must not put a
              -- credential-shaped value anywhere durable.
              ${`test-step-up-digest-${challengeId}`},
              'VERIFIED', ${new Date(verifiedAt.getTime() + 600_000)}, ${verifiedAt})
    `);
    return challengeId;
  }

  return {
    ...base,
    acceptance: base.get<AcceptQuotationUseCase>(AcceptQuotationUseCase),
    rejection: base.get<RejectQuotationUseCase>(RejectQuotationUseCase),
    quotations,
    idempotency: base.get<IdempotencyStore>(IdempotencyStore),

    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app6-b05-${newId()}` }, work),

    publishPolicies: async (stepUpWindowSeconds = STEP_UP_WINDOW_SECONDS): Promise<void> => {
      const adminId = await ensureAdmin();
      const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
      await base.inTransaction(async () => {
        await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP6-B05 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
          value: { maxRequestsPerIpPerMinute: 600 },
          valueSchemaVersion: 1,
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          createdByAdminId: adminId,
          reason: 'APP6-B05 suite fixture.',
        });
        await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP6-B05 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_GRANT_POLICY_KEY,
          value: { standardTtlSeconds: 7 * 24 * 60 * 60, stepUpWindowSeconds },
          valueSchemaVersion: 1,
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          createdByAdminId: adminId,
          reason: 'APP6-B05 suite fixture.',
        });
      });
    },

    seedTarget: async (options = {}): Promise<SeededDecisionTarget> => {
      const customerId = newId();
      const contactPointId = newId();
      // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
      // created in the same millisecond share their leading characters and a
      // derived value collides on the contact-point uniqueness arbiter.
      const normalizedValue = `app6b05-${randomBytes(6).toString('hex')}@example.test`;
      await db.execute(sql`
        insert into customers (id, display_name, verified_at)
        values (${customerId}, 'APP6 B05 Customer', now())
      `);
      await db.execute(sql`
        insert into customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
           verified_at, verified_source)
        values (${contactPointId}, ${customerId}, 'EMAIL', ${normalizedValue},
                ${normalizedValue}, true, now(), 'APP6-B05 suite fixture.')
      `);

      const requestId = newId();
      const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
      await db.execute(sql`
        insert into custom_requests (id, code, customer_id, status)
        values (${requestId}, ${code}, ${customerId}, ${options.requestStatus ?? 'QUOTED'})
      `);

      const token = mintTokenLocal();
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
                ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
                ${grantStatus === 'REVOKED' ? 'APP6-B05 suite fixture.' : null})
      `);

      const quotationId = newId() as QuotationId;
      const sentAt = new Date(Date.now() - (options.sentMinutesAgo ?? 60) * 60_000);
      const validUntil = new Date(
        sentAt.getTime() + (options.validityMinutes ?? 7 * 24 * 60) * 60_000,
      );
      // Three steps, not one: the pointer statement below runs on the pool, so
      // the quotation it names has to be committed before it can be referenced
      // (`fk_custom_requests__current_quotation_id`).
      await base.inTransaction(() =>
        quotations.createForRequest(
          quotationId,
          `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
          requestId,
        ),
      );
      const versionId = await base.inTransaction(async () => {
        const version = await quotations.addVersion(
          draftInput(quotationId, options.priced ?? { unitPrice: 150_000 }),
        );
        await quotations.send(version.id, validUntil, sentAt);
        await quotations.setCurrentVersion(quotationId, version.id);
        return version.id;
      });
      await db.execute(sql`
        update custom_requests set current_quotation_id = ${quotationId} where id = ${requestId}
      `);

      const customer: SeededCustomer = {
        customerId,
        contactPointId,
        contactKind: 'EMAIL',
        normalizedValue,
      };
      if (options.stepUpVerifiedSecondsAgo !== undefined) {
        await addStepUp(customer, options.stepUpVerifiedSecondsAgo);
      }

      return { ...customer, requestId, token, grantId, quotationId, versionId };
    },

    sendNewerVersion: async (target, unitPrice): Promise<QuotationVersionId> =>
      base.inTransaction(async () => {
        const version = await quotations.addVersion(draftInput(target.quotationId, { unitPrice }));
        const at = new Date();
        await quotations.send(version.id, new Date(at.getTime() + 7 * 24 * 60 * 60_000), at);
        await quotations.setCurrentVersion(target.quotationId, version.id);
        return version.id;
      }),

    addStepUp,

    revokeGrant: async (grantId): Promise<void> => {
      await db.execute(sql`
        update secure_access_grants
           set status = 'REVOKED', revoked_at = now(), revoke_reason = 'APP6-B05 suite fixture.'
         where id = ${grantId}
      `);
    },

    rows: async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> =>
      (await db.execute(query)).rows as T[],

    count: async (query: ReturnType<typeof sql>): Promise<number> => {
      const [row] = (await db.execute<{ count: string }>(query)).rows;
      return Number(row?.count ?? -1);
    },

    close: async (): Promise<void> => {
      await base.close();
      for (const [name, value] of previous) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    },
  };
}

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
function mintTokenLocal(): string {
  return randomBytes(32).toString('base64url');
}
