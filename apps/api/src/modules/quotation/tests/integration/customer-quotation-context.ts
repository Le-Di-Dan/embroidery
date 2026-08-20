/**
 * Shared harness for the `APP6-B04` customer quotation-read suite.
 *
 * Boots the real `CustomerQuotationModule` — real controller wiring, real
 * `AuthorizeSecureLink`, real `ResolveSecureLink`, real AGG-14 repository, real
 * Ordering pointer port — against a disposable database with every migration
 * applied.
 *
 * **Nothing under test is overridden.** In particular the digest is the real
 * one: the suite mints a token, computes its digest with the same `digestSecret`
 * the resolver uses, and stores only the digest — so a test that passes proves
 * the peppered HMAC path, not a stubbed comparison.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored on close. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * The send fixture writes the **three** rows `APP6-B03` commits — the frozen
 * version, `quotations.current_version_id` and `custom_requests.current_quotation_id`
 * — through the delivered repository and one pointer statement, in one
 * transaction. It does not re-run the send use case: that would pull the APP1
 * guards, the validity policy and the outbox into a suite about a read, and what
 * this read consumes is the committed pointer state, not the path that produced
 * it.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import { CustomerQuotationModule } from '../../customer-quotation.module';
import { ReadCurrentQuotation } from '../../application/customer/read-current-quotation.query';
import {
  QUOTATION_REPOSITORY,
  type AddQuotationVersionInput,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b04-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b04-test-secure-link-pepper-0002',
};

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface SeededGrantedRequest {
  readonly requestId: string;
  readonly customerId: string;
  readonly token: string;
  readonly grantId: string;
  readonly grantExpiresAt: Date;
}

export interface SeedRequestOptions {
  /** Reuse an existing customer, so one identity can hold two requests. */
  readonly customerId?: string | undefined;
  readonly status?: string;
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
}

/** The pricing knobs a seeded version varies, so no two rows share amounts. */
export interface PricedVersionOptions {
  readonly unitPrice: number;
  readonly quantity?: number;
  readonly adjustment?: number | undefined;
  readonly adjustmentReason?: string;
}

export interface CustomerQuotationTestContext extends PersistenceTestContext {
  readonly reader: ReadCurrentQuotation;
  readonly quotations: QuotationRepository;
  /** Runs `work` inside an async-local request context (the audit recorder needs one). */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  publishSecureLinkPolicy(maxRequestsPerIpPerMinute?: number): Promise<void>;
  seedRequest(options?: SeedRequestOptions): Promise<SeededGrantedRequest>;
  seedQuotation(requestId: string): Promise<QuotationId>;
  addDraft(quotationId: QuotationId, priced: PricedVersionOptions): Promise<QuotationVersionId>;
  /** The three writes `APP6-B03` commits, in one transaction. */
  sendVersion(input: {
    readonly requestId: string;
    readonly quotationId: QuotationId;
    readonly versionId: QuotationVersionId;
    readonly validUntil: Date;
    /**
     * The send instant, which becomes `valid_from`.
     *
     * Exposed because `ck_quotation_versions__validity_window` requires
     * `valid_from < valid_until` and `trg_quotation_versions__reject_mutation`
     * freezes both the moment the version leaves `DRAFT`. A window that has
     * already elapsed is therefore only representable by sending in the past —
     * it cannot be back-dated afterwards, by this fixture or by anything else.
     */
    readonly sentAt?: Date;
  }): Promise<void>;
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
}

export async function createCustomerQuotationContext(
  label: string,
): Promise<CustomerQuotationTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomerQuotationModule,
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
      values (${adminId}, ${`app6-b04-${adminId}@example.test`}, 'APP6 B04 Admin', 'ACTIVE')
    `);
    return adminId;
  }

  return {
    ...base,
    reader: base.get<ReadCurrentQuotation>(ReadCurrentQuotation),
    quotations,

    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app6-b04-${newId()}` }, work),

    publishSecureLinkPolicy: async (maxRequestsPerIpPerMinute = 60): Promise<void> => {
      const adminId = await ensureAdmin();
      const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
      await base.inTransaction(async () => {
        await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP6-B04 suite fixture.');
        await policies.publishVersion({
          configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
          value: { maxRequestsPerIpPerMinute },
          valueSchemaVersion: 1,
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          createdByAdminId: adminId,
          reason: 'APP6-B04 suite fixture.',
        });
      });
    },

    seedRequest: async (options = {}): Promise<SeededGrantedRequest> => {
      const requestId = newId();
      // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
      // created in the same millisecond share their leading characters and a
      // derived code collides on `uq_custom_requests__code`.
      const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

      let customerId = options.customerId;
      if (customerId === undefined) {
        customerId = newId();
        await db.execute(sql`
          insert into customers (id, display_name, verified_at)
          values (${customerId}, 'APP6 B04 Customer', now())
        `);
      }

      await db.execute(sql`
        insert into custom_requests (id, code, customer_id, status)
        values (${requestId}, ${code}, ${customerId}, ${options.status ?? 'QUOTED'})
      `);

      const token = mintToken();
      const grantId = newId();
      const grantExpiresAt = new Date(
        Date.now() + (options.grantExpiresInMinutes ?? 60 * 24 * 7) * 60_000,
      );
      const grantStatus = options.grantStatus ?? 'ACTIVE';
      await db.execute(sql`
        insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                          scope_kind, status, expires_at, revoked_at, revoke_reason)
        values (${grantId}, ${customerId}, ${requestId},
                ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
                'REQUEST_ACCESS', ${grantStatus}, ${grantExpiresAt},
                -- ck_secure_access_grants__revoke_reason_required: a revoked grant
                -- must say why, so the fixture cannot seed one that merely looks
                -- revoked.
                ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
                ${grantStatus === 'REVOKED' ? 'APP6-B04 suite fixture.' : null})
      `);

      return { requestId, customerId, token, grantId, grantExpiresAt };
    },

    seedQuotation: async (requestId: string): Promise<QuotationId> => {
      const id = newId() as QuotationId;
      await base.inTransaction(() =>
        quotations.createForRequest(
          id,
          `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
          requestId,
        ),
      );
      return id;
    },

    addDraft: async (
      quotationId: QuotationId,
      priced: PricedVersionOptions,
    ): Promise<QuotationVersionId> => {
      const version = await base.inTransaction(() =>
        quotations.addVersion(draftInput(quotationId, priced)),
      );
      return version.id;
    },

    sendVersion: async ({
      requestId,
      quotationId,
      versionId,
      validUntil,
      sentAt,
    }): Promise<void> => {
      await base.inTransaction(async () => {
        await quotations.send(versionId, validUntil, sentAt ?? new Date());
        await quotations.setCurrentVersion(quotationId, versionId);
        await db.execute(sql`
          update custom_requests set current_quotation_id = ${quotationId} where id = ${requestId}
        `);
      });
    },

    rows: async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> =>
      (await db.execute(query)).rows as T[],

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

/**
 * The priced input one DRAFT version is built from.
 *
 * Exact strings throughout, and the arithmetic CST-064 checks is done here in
 * whole đồng so the fixture cannot smuggle a fractional amount past the column.
 * The caller chooses the unit price, so no two versions in a fixture share
 * amounts and an assertion cannot pass by reading the wrong row.
 */
export function draftInput(
  quotationId: QuotationId,
  priced: PricedVersionOptions,
): AddQuotationVersionInput {
  const quantity = priced.quantity ?? 10;
  const adjustment = priced.adjustment ?? 0;
  const subtotal = priced.unitPrice * quantity;
  const shipping = 50_000;
  const total = subtotal + adjustment + shipping;
  const deposit = Math.round(total * 0.4);
  return {
    id: newId() as QuotationVersionId,
    quotationId,
    quantityTotal: quantity,
    subtotalAmount: `${subtotal}.00`,
    manualAdjustmentAmount: `${adjustment}.00`,
    adjustmentReason:
      adjustment === 0
        ? undefined
        : (priced.adjustmentReason ?? 'Internal: rush surcharge agreed by the workshop lead.'),
    shippingFeeAmount: `${shipping}.00`,
    totalAmount: `${total}.00`,
    depositPercent: '40.00',
    depositAmount: `${deposit}.00`,
    remainingAmount: `${total - deposit}.00`,
    stitchCount: 8_500,
    lineItems: [
      {
        position: 1,
        lineKind: 'PRODUCT',
        description: 'Áo polo thêu ngực trái',
        skuId: undefined,
        quantity,
        unitPriceAmount: `${priced.unitPrice}.00`,
        lineTotalAmount: `${subtotal}.00`,
      },
    ],
  };
}

/** The minimal request shape `PublicNetworkKeyService` reads. */
export function callerFrom(ip: string): {
  readonly headers: Record<string, unknown>;
  readonly socket: { readonly remoteAddress: string };
} {
  return { headers: {}, socket: { remoteAddress: ip } };
}
