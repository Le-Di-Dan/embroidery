/**
 * Shared harness for the `APP5-B03` grant-scoped status suite.
 *
 * Boots the real `CustomRequestStatusModule` — real controller wiring, real
 * `AuthorizeSecureLink`, real `ResolveSecureLink`, real repositories, real
 * catalog port — against a disposable database with every migration applied.
 *
 * **Nothing is overridden.** The intake harness replaces the object store
 * because a live MinIO would prove S3 works rather than proving the lane does;
 * this surface has no such dependency. In particular the digest is the real one:
 * the suite mints a token, computes its digest with the same `digestSecret` the
 * resolver uses, and stores only the digest — so a test that passes proves the
 * peppered HMAC path, not a stubbed comparison.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored on close. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import { SecureLinkRateLimiter } from '../../../customer/infrastructure/rate-limit/secure-link-rate-limiter';
import { CustomRequestStatusModule } from '../../custom-request-status.module';
import { ReadGrantScopedRequest } from '../../application/status/read-grant-scoped-request.query';

/**
 * Synthetic peppers, 32+ characters and distinct from each other and from the
 * two foreign secrets `app4-secret-pepper.config.ts` refuses collisions with.
 */
const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app5-b03-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app5-b03-test-secure-link-pepper-0002',
};

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A request as the caller sees it, plus what the test needs to mutate it. */
export interface SeededRequest {
  readonly requestId: string;
  readonly code: string;
  readonly customerId: string;
  /** The raw token of this request's `ACTIVE` `REQUEST_ACCESS` grant. */
  readonly token: string;
  readonly grantId: string;
  readonly grantExpiresAt: Date;
}

export interface SeedRequestOptions {
  /** Reuse an existing customer, so one identity can hold two requests. */
  readonly customerId?: string;
  readonly status?: string;
  readonly catalog?: { readonly productId: string; readonly productVariantId: string };
  readonly customerOwnedProduct?: {
    readonly name: string;
    readonly description?: string;
    readonly physicalWidthMm?: string;
    readonly physicalHeightMm?: string;
  };
  readonly quantities?: readonly {
    readonly productVariantId?: string;
    readonly sizeLabel?: string;
    readonly quantity: number;
  }[];
  readonly assets?: readonly { readonly role: string }[];
  readonly cancelledReason?: string;
  readonly cancelledCustomerReason?: string;
  /** Grant knobs, so expiry and revocation are seeded rather than waited out. */
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
  readonly grantScopeKind?: string;
}

export interface SeededCatalogSubject {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly colorName: string;
  readonly sizeLabel: string;
}

export interface RequestStatusTestContext extends PersistenceTestContext {
  readonly reader: ReadGrantScopedRequest;
  readonly limiter: SecureLinkRateLimiter;
  /**
   * Runs `work` inside an async-local request context.
   *
   * Required, not decorative: `SecureLinkAuditRecorder` writes the audit row's
   * `correlation_id` from `RequestContextService.requireRequestId()` and throws
   * outside a request. Supplying one here is what lets the suite exercise the
   * **real** recorder instead of overriding it away — an override would delete
   * the evidence that resolution is audited at all.
   */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  /** Publishes `secure_link.resolve` so the fail-closed policy read succeeds. */
  publishSecureLinkPolicy(maxRequestsPerIpPerMinute?: number): Promise<void>;
  seedCatalogSubject(): Promise<SeededCatalogSubject>;
  seedRequest(options?: SeedRequestOptions): Promise<SeededRequest>;
  /** Appends one TBL-042 row, as `APP5-B05` will. */
  recordTransition(input: {
    readonly requestId: string;
    readonly from: string;
    readonly to: string;
    readonly reason?: string;
    readonly customerVisibleReason?: string;
  }): Promise<void>;
}

export async function createRequestStatusContext(label: string): Promise<RequestStatusTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomRequestStatusModule,
  ]);
  const db = base.disposable.client.db;

  /**
   * The suite's one Admin row.
   *
   * `uq_admin_accounts__status__active` permits a single `ACTIVE` account, so
   * the policy fixture and the transition fixture share one rather than each
   * minting its own — a detail worth stating because it is the constraint, not
   * a preference: two ACTIVE admins is not a bigger fixture, it is an invalid
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
      values (${adminId}, ${`app5-b03-${adminId}@example.test`}, 'APP5 B03 Admin', 'ACTIVE')
    `);
    return adminId;
  }

  /**
   * Publishes the abuse limit through the repository the reader reads it with,
   * rather than by hand-writing three rows and a pointer. A fixture that built
   * the pointer itself could publish a shape `currentValue` would not return.
   */
  const publishSecureLinkPolicy: RequestStatusTestContext['publishSecureLinkPolicy'] = async (
    maxRequestsPerIpPerMinute = 60,
  ) => {
    const adminId = await ensureAdmin();
    const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    await base.inTransaction(async () => {
      await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP5-B03 suite fixture.');
      await policies.publishVersion({
        configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
        value: { maxRequestsPerIpPerMinute },
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP5-B03 suite fixture.',
      });
    });
  };

  const seedCatalogSubject: RequestStatusTestContext['seedCatalogSubject'] = async () => {
    const categoryId = newId();
    const productId = newId();
    const productVariantId = newId();
    const slug = `ao-thun-${productId.slice(0, 8)}`;

    await db.execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Áo', ${`ao-${categoryId.slice(0, 8)}`}, 1, 'DRAFT', true)
    `);
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Áo thun cotton', ${slug}, '150000', 'VND',
              'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Trắng', 'L', 1, true)
    `);

    return {
      productId,
      productVariantId,
      productName: 'Áo thun cotton',
      productSlug: slug,
      colorName: 'Trắng',
      sizeLabel: 'L',
    };
  };

  const seedRequest: RequestStatusTestContext['seedRequest'] = async (options = {}) => {
    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters and a
    // derived code collides on `uq_custom_requests__code`.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
    const status = options.status ?? 'NEW';

    let customerId = options.customerId;
    if (customerId === undefined) {
      customerId = newId();
      await db.execute(sql`
        insert into customers (id, display_name, verified_at)
        values (${customerId}, 'APP5 B03 Customer', now())
      `);
    }

    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                   customer_note, cancelled_reason, cancelled_customer_reason)
      values (${requestId}, ${code}, ${customerId}, ${status},
              ${options.catalog?.productId ?? null}, ${options.catalog?.productVariantId ?? null},
              'A customer note that is not part of the status projection.',
              ${options.cancelledReason ?? null}, ${options.cancelledCustomerReason ?? null})
    `);

    if (options.customerOwnedProduct !== undefined) {
      const cop = options.customerOwnedProduct;
      await db.execute(sql`
        insert into customer_owned_products (id, custom_request_id, name, description,
                                             physical_width_mm, physical_height_mm)
        values (${newId()}, ${requestId}, ${cop.name}, ${cop.description ?? null},
                ${cop.physicalWidthMm ?? null}, ${cop.physicalHeightMm ?? null})
      `);
    }

    for (const line of options.quantities ?? []) {
      await db.execute(sql`
        insert into custom_request_quantity_breakdowns
               (id, custom_request_id, product_variant_id, size_label, quantity)
        values (${newId()}, ${requestId}, ${line.productVariantId ?? null},
                ${line.sizeLabel ?? null}, ${line.quantity})
      `);
    }

    for (const asset of options.assets ?? []) {
      const assetId = newId();
      await db.execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                            checksum, status, uploaded_by_customer_id)
        values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
                ${`private/app5/${assetId}.png`}, 'image/png', 2048,
                ${`sha256:${'a'.repeat(64)}`}, 'ACCEPTED', ${customerId})
      `);
      await db.execute(sql`
        insert into custom_request_assets (id, custom_request_id, asset_id, role)
        values (${newId()}, ${requestId}, ${assetId}, ${asset.role})
      `);
    }

    const token = mintToken();
    const grantId = newId();
    const grantExpiresAt = new Date(
      Date.now() + (options.grantExpiresInMinutes ?? 60 * 24 * 7) * 60_000,
    );
    const grantStatus = options.grantStatus ?? 'ACTIVE';
    await db.execute(sql`
      insert into secure_access_grants (id, customer_id, custom_request_id, token_hash, scope_kind,
                                        status, expires_at, revoked_at, revoke_reason)
      values (${grantId}, ${customerId}, ${requestId},
              ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
              ${options.grantScopeKind ?? 'REQUEST_ACCESS'}, ${grantStatus}, ${grantExpiresAt},
              -- ck_secure_access_grants__revoke_reason_required: a revoked grant
              -- must say why, so the fixture cannot seed one that merely looks
              -- revoked.
              ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
              ${grantStatus === 'REVOKED' ? 'APP5-B03 suite fixture.' : null})
    `);

    return { requestId, code, customerId, token, grantId, grantExpiresAt };
  };

  const recordTransition: RequestStatusTestContext['recordTransition'] = async (input) => {
    const adminId = await ensureAdmin();
    await db.execute(sql`
      insert into custom_request_transitions
             (custom_request_id, from_status, to_status, actor_kind, admin_id, reason,
              customer_visible_reason, correlation_id)
      values (${input.requestId}, ${input.from}, ${input.to}, 'ADMIN', ${adminId},
              ${input.reason ?? null}, ${input.customerVisibleReason ?? null},
              ${`corr-${newId()}`})
    `);
    await db.execute(sql`
      update custom_requests set status = ${input.to} where id = ${input.requestId}
    `);
  };

  const requestContext = base.get<RequestContextService>(RequestContextService);

  return {
    ...base,
    reader: base.get<ReadGrantScopedRequest>(ReadGrantScopedRequest),
    limiter: base.get<SecureLinkRateLimiter>(SecureLinkRateLimiter),
    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app5-b03-${newId()}` }, work),
    publishSecureLinkPolicy,
    seedCatalogSubject,
    seedRequest,
    recordTransition,
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

/** The minimal request shape `PublicNetworkKeyService` reads. */
export function callerFrom(ip: string): {
  readonly headers: Record<string, unknown>;
  readonly socket: { readonly remoteAddress: string };
} {
  return { headers: {}, socket: { remoteAddress: ip } };
}
