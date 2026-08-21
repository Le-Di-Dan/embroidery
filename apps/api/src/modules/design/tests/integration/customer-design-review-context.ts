/**
 * Shared harness for the `APP6-B10` customer design-review suite.
 *
 * Boots the real `CustomerDesignReviewModule` — real controller wiring, real
 * `AuthorizeSecureLink`, real `ResolveSecureLink`, real narrow AGG-10 read port,
 * real policy reader and real AGG-21 agreement repository — against a disposable
 * database with every migration applied.
 *
 * **Nothing under test is overridden.** In particular the digest is the real
 * one: the suite mints a token, computes its digest with the same `digestSecret`
 * the resolver uses, and stores only the digest — so a test that passes proves
 * the peppered HMAC path, not a stubbed comparison. The agreement fixture runs
 * the delivered `PublishApp6AgreementsUseCase` against the committed dataset
 * rather than inserting rows, so what the read returns is what the bootstrap
 * actually publishes.
 *
 * The design fixture writes `design_cases` and `design_versions` directly. It
 * does **not** re-run `APP6-B08`'s create or `APP6-B09`'s send: that would pull
 * the APP1 guards, the freeze authority and the outbox into a suite about a
 * read, and what this read consumes is the committed row state, not the path
 * that produced it. Seeding directly is also the only way to stand up the state
 * the load-bearing negative needs — a case whose `current_version_id` points at
 * a newer DRAFT while an older version is `SENT_FOR_REVIEW` — which no delivered
 * route produces in one step.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored on close. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
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
import { PublishApp6AgreementsUseCase } from '../../../content/application/publish-app6-agreements.use-case';
import { DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY } from '../../domain/review/design-approval-agreements.policy';
import { CustomerDesignReviewModule } from '../../customer-design-review.module';
import { ReadCurrentDesignReview } from '../../application/review/read-current-design-review.query';

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b10-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b10-test-secure-link-pepper-0002',
};

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The request this suite reads through, and the live link that opens it. */
export interface SeededGrantedRequest {
  readonly requestId: string;
  readonly customerId: string;
  readonly designCaseId: string;
  readonly token: string;
  readonly grantId: string;
  readonly grantExpiresAt: Date;
}

export interface SeedRequestOptions {
  readonly customerId?: string | undefined;
  readonly status?: string;
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
  /** Omit the design case, reproducing a request the workshop has not opened. */
  readonly withDesignCase?: boolean;
}

/** The frozen Catalog quartet CST-129 requires whole or not at all. */
export interface SeededPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface SeedVersionOptions {
  readonly designCaseId: string;
  readonly version: number;
  readonly document: unknown;
  readonly documentSchemaVersion: number;
  readonly status?: string;
  readonly documentHash?: string;
  readonly sentAt?: Date;
  /** Whether to point the design case at this version. Defaults to false here. */
  readonly makeCurrent?: boolean;
  /**
   * The Catalog branch's frozen quartet. Omit for the customer-owned branch,
   * which is then seeded with its own product row and the two labels CST-130
   * requires.
   *
   * The branch is a **placement** fact and `documentSchemaVersion` is a
   * **document** fact; they correlate in production but the read under test
   * touches neither placement column, so the suite varies them independently
   * rather than pretending one implies the other.
   */
  readonly placement?: SeededPlacement;
}

export interface CustomerDesignReviewTestContext extends PersistenceTestContext {
  readonly reader: ReadCurrentDesignReview;
  readonly agreements: PublishApp6AgreementsUseCase;
  /** Runs `work` inside an async-local request context (the audit recorder needs one). */
  asRequest<T>(work: () => Promise<T>): Promise<T>;
  publishSecureLinkPolicy(maxRequestsPerIpPerMinute?: number): Promise<void>;
  publishAgreementsPolicy(requiredAgreementTypes: readonly string[]): Promise<void>;
  /** Runs the delivered bootstrap publisher with a real resolved Admin id. */
  publishAgreementContent(): Promise<void>;
  /** One complete Catalog placement chain, for the Catalog-branch versions. */
  seedPlacement(): Promise<SeededPlacement>;
  seedRequest(options?: SeedRequestOptions): Promise<SeededGrantedRequest>;
  seedVersion(options: SeedVersionOptions): Promise<string>;
  pointCaseAt(designCaseId: string, versionId: string): Promise<void>;
  rows<T>(query: ReturnType<typeof sql>): Promise<T[]>;
  count(query: ReturnType<typeof sql>): Promise<number>;
}

export async function createCustomerDesignReviewContext(
  label: string,
): Promise<CustomerDesignReviewTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomerDesignReviewModule,
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
      values (${adminId}, ${`app6-b10-${adminId}@example.test`}, 'APP6 B10 Admin', 'ACTIVE')
    `);
    return adminId;
  }

  async function publishPolicy(configKey: string, value: Record<string, unknown>): Promise<void> {
    const adminId = await ensureAdmin();
    const policies = base.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    await base.inTransaction(async () => {
      await policies.ensureKey(configKey, 'APP6-B10 suite fixture.');
      await policies.publishVersion({
        configKey,
        value,
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP6-B10 suite fixture.',
      });
    });
  }

  return {
    ...base,
    reader: base.get<ReadCurrentDesignReview>(ReadCurrentDesignReview),
    agreements: base.get<PublishApp6AgreementsUseCase>(PublishApp6AgreementsUseCase),

    asRequest: <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: `app6-b10-${newId()}` }, work),

    publishSecureLinkPolicy: (maxRequestsPerIpPerMinute = 60): Promise<void> =>
      publishPolicy(SECURE_LINK_RESOLVE_POLICY_KEY, { maxRequestsPerIpPerMinute }),

    publishAgreementsPolicy: (requiredAgreementTypes): Promise<void> =>
      publishPolicy(DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY, {
        requiredAgreementTypes: [...requiredAgreementTypes],
      }),

    seedPlacement: async (): Promise<SeededPlacement> => {
      const categoryId = newId();
      const productId = newId();
      const productVariantId = newId();
      const assetId = newId();
      const productSideId = newId();
      const embroideryAreaId = newId();

      await db.execute(sql`
        insert into categories (id, name, slug, display_order, status, is_indexable)
        -- Random rather than derived from the id:  is UUIDv7, so two
        -- rows created in the same millisecond share their leading characters
        -- and a derived slug collides on .
        values (${categoryId}, 'Áo', ${`ao-${randomBytes(6).toString('hex')}`}, 1, 'PUBLISHED', true)
      `);
      await db.execute(sql`
        insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                              status, is_display_out_of_stock, display_order, is_indexable)
        values (${productId}, ${categoryId}, 'Áo thun cotton',
                ${`ao-thun-${randomBytes(6).toString('hex')}`}, '150000', 'VND',
                'PUBLISHED', false, 1, true)
      `);
      await db.execute(sql`
        insert into product_variants (id, product_id, color_name, size_label, display_order,
                                      is_active)
        values (${productVariantId}, ${productId}, 'Trắng', 'L', 1, true)
      `);
      await db.execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC',
                ${`catalog/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
      `);
      await db.execute(sql`
        insert into product_sides
          (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
           physical_width_mm, physical_height_mm, px_per_mm, display_order)
        values (${productSideId}, ${productId}, 'front', 'Front', ${assetId},
                1000, 1200, 400, 480, 2.5, 1)
      `);
      await db.execute(sql`
        insert into embroidery_areas
          (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
           bound_height_px, display_order)
        values (${embroideryAreaId}, ${productSideId}, 'chest', 'Chest', 100, 150, 300, 200, 1)
      `);

      return { productId, productVariantId, productSideId, embroideryAreaId };
    },

    publishAgreementContent: async (): Promise<void> => {
      const adminId = await ensureAdmin();
      await base.get<PublishApp6AgreementsUseCase>(PublishApp6AgreementsUseCase).publish(adminId);
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
          values (${customerId}, 'APP6 B10 Customer', now())
        `);
      }

      await db.execute(sql`
        insert into custom_requests (id, code, customer_id, status)
        values (${requestId}, ${code}, ${customerId}, ${options.status ?? 'DESIGN_REVIEW'})
      `);

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
                ${grantStatus === 'REVOKED' ? 'APP6-B10 suite fixture.' : null})
      `);

      return { requestId, customerId, designCaseId, token, grantId, grantExpiresAt };
    },

    seedVersion: async (options): Promise<string> => {
      const versionId = newId();
      const status = options.status ?? 'DRAFT';
      // CST-074: a version that has left DRAFT must carry a hash, and one that
      // has been sent must carry an instant, so a seeded `SENT_FOR_REVIEW` row is
      // a row the database would actually have accepted.
      const sent = status !== 'DRAFT';
      const documentHash = options.documentHash ?? (sent ? `sha256:${'a'.repeat(64)}` : null);
      const sentAt = options.sentAt ?? (sent ? new Date() : null);

      // CST-129 accepts a whole Catalog quartet or a COP id, never a mix and
      // never half of either; CST-130 then requires both labels on the COP
      // branch and forbids them on the Catalog one. Building the two branches
      // here rather than at each call site is what keeps every seeded row one
      // the database would actually have accepted.
      let customerOwnedProductId: string | null = null;
      if (options.placement === undefined) {
        const [designCase] = (
          await db.execute<{ readonly custom_request_id: string }>(sql`
            select custom_request_id from design_cases where id = ${options.designCaseId}
          `)
        ).rows;
        customerOwnedProductId = newId();
        await db.execute(sql`
          insert into customer_owned_products (id, custom_request_id, name)
          values (${customerOwnedProductId}, ${designCase?.custom_request_id ?? null}, 'Áo khoác của khách')
          on conflict (custom_request_id) do nothing
        `);
        const [existing] = (
          await db.execute<{ readonly id: string }>(sql`
            select id from customer_owned_products
             where custom_request_id = ${designCase?.custom_request_id ?? null}
          `)
        ).rows;
        customerOwnedProductId = existing?.id ?? customerOwnedProductId;
      }

      await db.execute(sql`
        insert into design_versions
          (id, design_case_id, version, status, design_document, document_schema_version,
           document_hash, sent_at, product_id, product_variant_id, product_side_id,
           embroidery_area_id, customer_owned_product_id, placement_side_label,
           placement_area_label, physical_width_mm, physical_height_mm)
        values (${versionId}, ${options.designCaseId}, ${options.version}, ${status},
                ${JSON.stringify(options.document)}::jsonb, ${options.documentSchemaVersion},
                ${documentHash}, ${sentAt},
                ${options.placement?.productId ?? null},
                ${options.placement?.productVariantId ?? null},
                ${options.placement?.productSideId ?? null},
                ${options.placement?.embroideryAreaId ?? null},
                ${customerOwnedProductId},
                ${customerOwnedProductId === null ? null : 'Mặt trước'},
                ${customerOwnedProductId === null ? null : 'Ngực trái'},
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

    pointCaseAt: async (designCaseId, versionId): Promise<void> => {
      await db.execute(sql`
        update design_cases set current_version_id = ${versionId} where id = ${designCaseId}
      `);
    },

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
}

/** A v1 Catalog document. The placement snapshot is never re-validated on read. */
export function catalogDocument(elements: unknown[] = []): unknown {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: newId(),
      embroideryAreaId: newId(),
      canvasWidthPx: 1000,
      canvasHeightPx: 1200,
      physicalWidthMm: 400,
      physicalHeightMm: 480,
      pxPerMm: 2.5,
    },
    elements,
  };
}

/** A v2 customer-owned document whose canvas *is* the envelope. */
export function customerOwnedDocument(elements: unknown[] = []): unknown {
  return {
    schemaVersion: 2,
    placement: {
      productSideId: null,
      embroideryAreaId: null,
      canvasWidthPx: 120,
      canvasHeightPx: 80,
      physicalWidthMm: 120,
      physicalHeightMm: 80,
      pxPerMm: 1,
    },
    elements,
  };
}

/** A minimal shape element at an explicit position, in P01's own field names. */
export function shapeAt(id: string, x: number, y: number): unknown {
  return {
    id,
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x, y, width: 40, height: 30, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    shape: 'rectangle',
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidthPx: 2,
  };
}

/** A caller the network-key service can read, with no real socket. */
export function callerFrom(ip: string): {
  readonly headers: Record<string, unknown>;
  readonly socket: { readonly remoteAddress: string };
} {
  return { headers: {}, socket: { remoteAddress: ip } };
}
