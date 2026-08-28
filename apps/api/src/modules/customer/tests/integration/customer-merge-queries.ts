/**
 * Fixtures and state readers for the `APP10-B02` merge suites.
 *
 * `admin-support-context.ts` boots the application and seeds a customer with two
 * verified contacts; `customer-maintenance-queries.ts` adds the contact states
 * `APP10-B01` needed. Neither seeds what B02 has to prove, which is a customer
 * that genuinely **owns things**: requests, an order, uploaded assets, a
 * business profile — and, just as importantly, rows of *frozen* commercial
 * evidence that carry a `customer_id` and must never be counted as movable.
 *
 * ### The order chain is real, and it has to be
 *
 * `orders` requires `custom_request_id`, `accepted_quotation_version_id` and
 * `current_approval_snapshot_id`, all NOT NULL under RESTRICT foreign keys, so
 * an order cannot be conjured. {@link seedOwnedCommerce} inserts the whole chain
 * the schema demands. That is not incidental cost: seeding it produces an
 * `approval_snapshots` row carrying the same `customer_id`, which is exactly the
 * frozen category the preview must exclude — the fixture that makes the positive
 * assertion possible also makes the negative one possible.
 *
 * The readers go straight to the tables rather than through the API, because
 * half of what B02 must prove is that something did **not** happen:
 * `customer_merge_events` stayed empty, `customers.merged_into_customer_id` was
 * never written, no contact moved. An assertion phrased against a response
 * cannot see a row that was not written.
 *
 * Every contact value here is synthetic and obviously so.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { AdminSupportTestContext } from './admin-support-context';

async function rows<T>(
  context: AdminSupportTestContext,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = await context.disposable.client.db.execute(statement);
  return result.rows as T[];
}

export interface MergeCaseRow {
  readonly id: string;
  readonly survivor_customer_id: string;
  readonly loser_customer_id: string;
  readonly status: string;
  readonly reason: string;
  readonly requested_by_admin_id: string;
  readonly decided_at: string | null;
}

export interface MergeAuditRow {
  readonly action: string;
  readonly actor_kind: string;
  readonly admin_id: string | null;
  readonly target_kind: string;
  readonly target_id: string;
  readonly summary: unknown;
  readonly reason: string | null;
}

/** Every merge case, oldest first. */
export function mergeCaseRows(context: AdminSupportTestContext): Promise<MergeCaseRow[]> {
  return rows<MergeCaseRow>(
    context,
    sql`select id, survivor_customer_id, loser_customer_id, status, reason,
               requested_by_admin_id, decided_at
        from customer_merge_cases order by created_at, id`,
  );
}

/**
 * How many `customer_merge_events` rows exist at all.
 *
 * A global count, deliberately: B02 must append **zero**, and a count scoped to
 * one case would pass while a stray row sat under another.
 */
export async function mergeEventCount(context: AdminSupportTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from customer_merge_events`,
  );
  return row?.total ?? 0;
}

/** Every audit row about one merge case, oldest first. */
export function mergeAuditRows(
  context: AdminSupportTestContext,
  caseId: string,
): Promise<MergeAuditRow[]> {
  return rows<MergeAuditRow>(
    context,
    sql`select action, actor_kind, admin_id, target_kind, target_id, summary, reason
        from audit_events
        where target_kind = 'CUSTOMER_MERGE_CASE' and target_id = ${caseId}
        order by occurred_at, id`,
  );
}

/** Every audit row in the database. Used to prove a read wrote nothing. */
export async function auditEventCount(context: AdminSupportTestContext): Promise<number> {
  const [row] = await rows<{ total: number }>(
    context,
    sql`select count(*)::int as total from audit_events`,
  );
  return row?.total ?? 0;
}

export interface OwnershipSnapshot {
  readonly mergedIntoCustomerId: string | null;
  readonly contactPoints: number;
  readonly activeGrants: number;
  readonly customRequests: number;
  readonly orders: number;
  readonly uploadedAssets: number;
  readonly businessProfiles: number;
  readonly approvalSnapshots: number;
  readonly quotationAcceptances: number;
}

/**
 * Everything a merge would move, plus the two frozen categories, for one
 * customer.
 *
 * Taken before and after an operation so a suite can assert that a preview, a
 * detail read or a rejection moved nothing at all — one comparison instead of
 * nine, so a category added later cannot be silently left unwatched.
 */
export async function ownershipSnapshot(
  context: AdminSupportTestContext,
  customerId: string,
): Promise<OwnershipSnapshot> {
  const [row] = await rows<{
    merged_into_customer_id: string | null;
    contact_points: number;
    active_grants: number;
    custom_requests: number;
    orders: number;
    uploaded_assets: number;
    business_profiles: number;
    approval_snapshots: number;
    quotation_acceptances: number;
  }>(
    context,
    sql`select
          (select merged_into_customer_id from customers where id = ${customerId})
            as merged_into_customer_id,
          (select count(*)::int from customer_contact_points where customer_id = ${customerId})
            as contact_points,
          (select count(*)::int from secure_access_grants
             where customer_id = ${customerId} and status = 'ACTIVE') as active_grants,
          (select count(*)::int from custom_requests where customer_id = ${customerId})
            as custom_requests,
          (select count(*)::int from orders where customer_id = ${customerId}) as orders,
          (select count(*)::int from assets where uploaded_by_customer_id = ${customerId})
            as uploaded_assets,
          (select count(*)::int from business_profiles where customer_id = ${customerId})
            as business_profiles,
          (select count(*)::int from approval_snapshots where customer_id = ${customerId})
            as approval_snapshots,
          (select count(*)::int from quotation_acceptances where customer_id = ${customerId})
            as quotation_acceptances`,
  );

  return {
    mergedIntoCustomerId: row?.merged_into_customer_id ?? null,
    contactPoints: row?.contact_points ?? 0,
    activeGrants: row?.active_grants ?? 0,
    customRequests: row?.custom_requests ?? 0,
    orders: row?.orders ?? 0,
    uploadedAssets: row?.uploaded_assets ?? 0,
    businessProfiles: row?.business_profiles ?? 0,
    approvalSnapshots: row?.approval_snapshots ?? 0,
    quotationAcceptances: row?.quotation_acceptances ?? 0,
  };
}

export interface OwnedCommerce {
  readonly customRequestId: string;
  readonly orderId: string;
  readonly grantId: string;
  readonly approvalSnapshotId: string;
}

/**
 * One customer that owns things, and has frozen evidence about them.
 *
 * Live, and therefore expected in the preview: **2** custom requests (the order
 * hangs off one; the second exists so `customRequests` and `orders` cannot be
 * confused for each other), **1** order, **1** ACTIVE grant, **2** uploaded
 * assets and **1** business profile.
 *
 * Frozen, and therefore expected to be absent from it: **1** approval snapshot
 * and **1** quotation acceptance, both carrying this customer's id.
 *
 * The catalog and design rows in between exist only because the foreign keys
 * demand them. They belong to no customer.
 */
export async function seedOwnedCommerce(
  context: AdminSupportTestContext,
  customerId: string,
): Promise<OwnedCommerce> {
  const db = context.disposable.client.db;
  const id = {
    category: newId(),
    product: newId(),
    variant: newId(),
    side: newId(),
    area: newId(),
    catalogAsset: newId(),
    request: newId(),
    secondRequest: newId(),
    quotation: newId(),
    quotationVersion: newId(),
    acceptance: newId(),
    designCase: newId(),
    designVersion: newId(),
    approval: newId(),
    grant: newId(),
    challenge: newId(),
    order: newId(),
  };
  const hash = `sha256:${'2'.repeat(64)}`;

  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${id.request}, ${`REQ-${id.request}`}, ${customerId}, 'APPROVED'),
           (${id.secondRequest}, ${`REQ-${id.secondRequest}`}, ${customerId}, 'NEW')
  `);
  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${id.category}, 'Cat', ${`cat-${id.category}`}, 'PUBLISHED', 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${id.product}, ${id.category}, 'Tee', ${`tee-${id.product}`}, 150000, 'VND',
            'PUBLISHED', false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${id.variant}, ${id.product}, 'Black', 'M', 1, true)
  `);
  // A CATALOG_MEDIA asset with **no** uploader: it is scaffolding for the
  // product side, and counting it would make `uploadedAssets` wrong.
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${id.catalogAsset}, 'CATALOG_MEDIA', 'PUBLIC', ${`c/${id.catalogAsset}.png`},
            'image/png', 512, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into product_sides
      (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
       physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values (${id.side}, ${id.product}, 'front', 'Front', ${id.catalogAsset}, 1000, 1200,
            400, 480, 2.5, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px, bound_height_px,
       display_order)
    values (${id.area}, ${id.side}, 'chest', 'Chest', 100, 150, 300, 200, 1)
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${id.grant}, ${customerId}, ${id.request}, ${`fixture-digest-marker-${id.grant}`},
            'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
  `);
  await db.execute(sql`
    insert into quotations (id, code, custom_request_id, status)
    values (${id.quotation}, ${`QUO-${id.quotation}`}, ${id.request}, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into quotation_versions
      (id, quotation_id, version, status, quantity_total, subtotal_amount,
       manual_adjustment_amount, shipping_fee_amount, total_amount,
       deposit_percent, deposit_amount, remaining_amount, currency_code, accepted_at)
    values (${id.quotationVersion}, ${id.quotation}, 1, 'ACCEPTED', 10, 1000000.00,
            0.00, 0.00, 1000000.00, 30.00, 300000.00, 700000.00, 'VND', now())
  `);
  // The step-up evidence both frozen rows below require (NOT NULL on each). It
  // carries no `contact_point_id` — the column is nullable, and binding one
  // would add a contact this customer does not otherwise have and would move
  // the `contactPoints` count the preview asserts.
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
    values (${id.challenge}, 'EMAIL', ${`stepup-${id.challenge}@vidu-b02.test`}, 'STEP_UP',
            'fixture-digest-marker', 'VERIFIED', now() + interval '1 hour', now())
  `);
  // Frozen evidence #1: the customer's acceptance of a commercial offer.
  await db.execute(sql`
    insert into quotation_acceptances
      (quotation_version_id, customer_id, grant_id, step_up_challenge_id,
       accepted_total_amount, currency_code, accepted_at)
    values (${id.quotationVersion}, ${customerId}, ${id.grant}, ${id.challenge},
            1000000.00, 'VND', now())
  `);
  await db.execute(sql`
    insert into design_cases (id, custom_request_id) values (${id.designCase}, ${id.request})
  `);
  await db.execute(sql`
    insert into design_versions
      (id, design_case_id, version, status, design_document, document_schema_version,
       document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
       physical_width_mm, physical_height_mm, approved_at)
    values (${id.designVersion}, ${id.designCase}, 1, 'APPROVED', '{}'::jsonb, 1,
            ${hash}, ${id.product}, ${id.variant}, ${id.side}, ${id.area}, 100.00, 100.00, now())
  `);
  // Frozen evidence #2: what the customer approved for production.
  await db.execute(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
       product_id, product_variant_id, product_side_id, embroidery_area_id,
       product_name, side_name, area_name, physical_width_mm, physical_height_mm,
       quantity_total, grant_id, step_up_challenge_id, approved_at)
    values (${id.approval}, ${id.designVersion}, ${id.designCase}, ${id.request}, ${customerId},
            ${hash}, ${id.product}, ${id.variant}, ${id.side}, ${id.area},
            'Tee', 'Front', 'Chest', 100.00, 100.00, 10, ${id.grant}, ${id.challenge}, now())
  `);
  await db.execute(sql`
    insert into orders
      (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
       current_approval_snapshot_id, status, total_amount, currency_code)
    values (${id.order}, ${`ORD-${id.order}`}, ${id.request}, ${customerId},
            ${id.quotationVersion}, ${id.approval}, 'DEPOSIT_PAID', 1000000.00, 'VND')
  `);
  await seedUploadedAssets(context, customerId, 2);
  await db.execute(sql`
    insert into business_profiles (id, customer_id, company_name)
    values (${newId()}, ${customerId}, 'Công ty Vi Du')
  `);

  return {
    customRequestId: id.request,
    orderId: id.order,
    grantId: id.grant,
    approvalSnapshotId: id.approval,
  };
}

/** Customer-uploaded originals — the rows `assets.uploaded_by_customer_id` names. */
export async function seedUploadedAssets(
  context: AdminSupportTestContext,
  customerId: string,
  howMany: number,
): Promise<void> {
  for (let index = 0; index < howMany; index += 1) {
    const assetId = newId();
    await context.disposable.client.db.execute(sql`
      insert into assets
        (id, kind, classification, storage_key, mime_type, size_bytes, status,
         uploaded_by_customer_id)
      values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE', ${`u/${assetId}.png`}, 'image/png',
              1024, 'ACCEPTED', ${customerId})
    `);
  }
}

/**
 * A minimal verified customer with one primary EMAIL contact.
 *
 * Lighter than the shared two-contact fixture, so a suite that needs a third or
 * fourth participant does not spend two contacts on each. The value is caller-
 * supplied because a *verified* contact is unique on `(kind, normalized_value)`
 * across every customer.
 */
export async function seedBareCustomer(
  context: AdminSupportTestContext,
  email: string,
  displayName = 'B02 Customer',
): Promise<string> {
  const customerId = newId();
  await context.disposable.client.db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${displayName}, '2026-08-14T09:00:00.000Z')
  `);
  await context.disposable.client.db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${newId()}, ${customerId}, 'EMAIL', ${email}, ${email}, true,
            '2026-08-14T09:00:00.000Z', 'OTP')
  `);
  return customerId;
}

/** Inserts one merge case directly, in whatever state a case needs. */
export async function seedMergeCase(
  context: AdminSupportTestContext,
  input: {
    readonly survivorCustomerId: string;
    readonly loserCustomerId: string;
    readonly status: 'REQUESTED' | 'EXECUTED' | 'REJECTED';
    readonly adminId: string;
    readonly reason?: string;
  },
): Promise<string> {
  const caseId = newId();
  const decidedAt = input.status === 'REQUESTED' ? null : new Date().toISOString();
  await context.disposable.client.db.execute(sql`
    insert into customer_merge_cases
      (id, survivor_customer_id, loser_customer_id, status, reason, requested_by_admin_id,
       decided_at)
    values (${caseId}, ${input.survivorCustomerId}, ${input.loserCustomerId}, ${input.status},
            ${input.reason ?? 'Seeded fixture case.'}, ${input.adminId}, ${decidedAt})
  `);
  return caseId;
}
