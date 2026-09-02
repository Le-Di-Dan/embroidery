/**
 * The committed, deposit-paid order the `APP8-W01` suite reserves against.
 *
 * An order sits at the end of the longest chain in the system: customer →
 * request → quotation (accepted) → design case → version → approval → order →
 * frozen items. Seeding it with raw SQL keeps the suite about the reservation
 * rather than about replaying six other contexts' APIs — the same argument the
 * delivered `inventory-fixture.ts` and `order-conversion-fixture.ts` both make,
 * restated here because the worker may not import `apps/api`.
 *
 * What each option exists to produce:
 *
 * ```text
 * items          the frozen order_items: Catalog (a SKU + quantity) or COP
 * stock          which SKUs get a sku_stocks anchor, and with how much on hand
 *                — a SKU deliberately left out of this map has NO anchor, which
 *                  is §9's missing-anchor case and must stay an operational
 *                  failure rather than a lazy `ensureStockRow`
 * depositStatus  SATISFIED by default; PENDING seeds §19.1 case 9's stale event
 * ```
 *
 * Test-only.
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

/** One frozen order item. Exactly one of the two subjects is set (S24/INV-12). */
export interface SeedItem {
  readonly sku: string;
  readonly quantity: number;
}

export interface SeedCopItem {
  readonly cop: true;
  readonly quantity: number;
}

export interface SeedOrderOptions {
  /** Frozen items, in `position` order. Keys in `sku` are fixture-local labels. */
  readonly items: readonly (SeedItem | SeedCopItem)[];
  /** Fixture-local SKU label → on-hand quantity. An absent label gets no anchor. */
  readonly stock?: Readonly<Record<string, number>>;
  /** GRD-013's half. `PENDING` makes the order reservation-ineligible. */
  readonly depositStatus?: 'SATISFIED' | 'PENDING';
  /** Distinguishes parallel chains inside one database. */
  readonly suffix: string;
}

export interface SeededOrder {
  readonly orderId: string;
  readonly customRequestId: string;
  readonly paymentAttemptId: string;
  readonly paymentObligationId: string;
  /** Fixture-local SKU label → the real `skus.id`. */
  readonly skuIds: Readonly<Record<string, string>>;
  /** Fixture-local SKU label → the real `sku_stocks.id`, where one was seeded. */
  readonly stockIds: Readonly<Record<string, string>>;
}

const DOC_HASH = `sha256:${'3'.repeat(64)}`;

export async function seedDepositPaidOrder(
  disposable: DisposableDatabase,
  options: SeedOrderOptions,
): Promise<SeededOrder> {
  const db = disposable.client.db;
  const { suffix } = options;

  const ids = {
    customer: newId(),
    contact: newId(),
    request: newId(),
    grant: newId(),
    challenge: newId(),
    category: newId(),
    product: newId(),
    variant: newId(),
    asset: newId(),
    side: newId(),
    area: newId(),
    quotation: newId(),
    quotationVersion: newId(),
    designCase: newId(),
    designVersion: newId(),
    approval: newId(),
    order: newId(),
    cop: newId(),
    obligation: newId(),
    attempt: newId(),
  };

  await executeRaw(
    db,
    sql`INSERT INTO customers (id, display_name, verified_at)
        VALUES (${ids.customer}, ${`Reservation Customer ${suffix}`}, now())`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
           verified_at, verified_source)
        VALUES (${ids.contact}, ${ids.customer}, 'EMAIL', ${`w01-${ids.customer}@example.com`},
                ${`w01-${ids.customer}@example.com`}, true, now(), 'OTP')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO custom_requests (id, code, customer_id, status)
        VALUES (${ids.request}, ${`REQ-${ids.request}`}, ${ids.customer}, 'APPROVED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO secure_access_grants
          (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
        VALUES (${ids.grant}, ${ids.customer}, ${ids.request}, ${`hash-${ids.grant}`},
                'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO contact_verification_challenges
          (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
           status, expires_at, verified_at)
        VALUES (${ids.challenge}, ${ids.contact}, 'EMAIL', ${`w01-${ids.customer}@example.com`},
                'STEP_UP', 'hash', 'VERIFIED', now() + interval '1 hour', now())`,
  );

  await seedCatalogChain(disposable, ids, suffix);

  // The frozen SKUs. One `skus` row per distinct fixture label.
  //
  // The generated ids are **sorted and then handed to the sorted labels**, so
  // `skuIds.a < skuIds.b` always holds. `newId()` is a random UUID, so without
  // this the relative order of two SKUs would be random per run — and W01 takes
  // its anchor locks in ascending SKU id, which is exactly what the multi-SKU
  // rollback case needs to control: label `a` is processed first, label `b`
  // second. A test that assumed label order without pinning id order would pass
  // half the time.
  const labels = [...new Set(options.items.flatMap((item) => ('sku' in item ? [item.sku] : [])))];
  labels.sort();
  const generated = labels.map(() => newId()).sort();
  const skuIds: Record<string, string> = {};
  const stockIds: Record<string, string> = {};

  for (const [index, label] of labels.entries()) {
    const skuId = generated[index] as string;
    skuIds[label] = skuId;
    await executeRaw(
      db,
      sql`INSERT INTO skus (id, product_variant_id, code, currency_code, is_active)
          VALUES (${skuId}, ${ids.variant}, ${`SKU-${suffix}-${index}`}, 'VND', true)`,
    );

    const onHand = options.stock?.[label];
    if (onHand === undefined) {
      // Deliberately no `sku_stocks` row: `APP8-B01` made anchor creation an
      // Admin operation, and §9 forbids the order path creating one.
      continue;
    }
    const stockId = newId();
    stockIds[label] = stockId;
    await executeRaw(
      db,
      sql`INSERT INTO sku_stocks (id, sku_id, quantity_on_hand)
          VALUES (${stockId}, ${skuId}, ${onHand})`,
    );
  }

  if (options.items.some((item) => !('sku' in item))) {
    await executeRaw(
      db,
      sql`INSERT INTO customer_owned_products (id, custom_request_id, name)
          VALUES (${ids.cop}, ${ids.request}, ${`Customer jacket ${suffix}`})`,
    );
  }

  await executeRaw(
    db,
    // `origin` is stated because `APP12-DB01` made the column `NOT NULL` with
    // no default, deliberately, so every writer says which order shape it is
    // creating. This fixture builds a **custom** order — it has a request, an
    // accepted quotation and an approval snapshot, all three of which
    // `ck_orders__custom_chain_by_origin` requires of `CUSTOM` and forbids to
    // `READY_MADE`. Every API fixture was updated by DB01; this worker one was
    // missed, and it is repaired here rather than worked around.
    sql`INSERT INTO orders
          (id, code, origin, custom_request_id, customer_id, accepted_quotation_version_id,
           current_approval_snapshot_id, status, total_amount, currency_code)
        VALUES (${ids.order}, ${`ORD-${ids.order}`}, 'CUSTOM', ${ids.request}, ${ids.customer},
                ${ids.quotationVersion}, ${ids.approval}, 'DEPOSIT_PAID', 1000000.00, 'VND')`,
  );

  for (const [index, item] of options.items.entries()) {
    const isCatalog = 'sku' in item;
    await executeRaw(
      db,
      sql`INSERT INTO order_items
            (id, order_id, position, sku_id, customer_owned_product_id, product_name,
             variant_label, size_label, quantity, unit_price_amount, line_total_amount,
             currency_code, approval_snapshot_id)
          VALUES (${newId()}, ${ids.order}, ${index + 1},
                  ${isCatalog ? (skuIds[item.sku] as string) : null},
                  ${isCatalog ? null : ids.cop},
                  ${isCatalog ? 'Tee' : 'Customer jacket'}, 'Black', 'M',
                  ${item.quantity}, 150000.00, ${(150_000 * item.quantity).toFixed(2)}, 'VND',
                  ${ids.approval})`,
    );
  }

  // GRD-013's deposit half, and the attempt the `payment.verified` event names.
  await executeRaw(
    db,
    sql`INSERT INTO payment_obligations
          (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
        VALUES (${ids.obligation}, ${ids.order}, 'DEPOSIT', 300000.00, 'VND', 'PENDING',
                ${ids.quotationVersion})`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO payment_attempts
          (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
        VALUES (${ids.attempt}, ${ids.obligation}, 300000.00, 'VND', 'BANK_TRANSFER',
                'SUCCEEDED', now())`,
  );
  if ((options.depositStatus ?? 'SATISFIED') === 'SATISFIED') {
    await executeRaw(
      db,
      sql`UPDATE payment_obligations
          SET status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${ids.attempt}
          WHERE id = ${ids.obligation}`,
    );
  }

  return {
    orderId: ids.order,
    customRequestId: ids.request,
    paymentAttemptId: ids.attempt,
    paymentObligationId: ids.obligation,
    skuIds,
    stockIds,
  };
}

/**
 * Appends the SE-007 row exactly as `PaymentDecisionRecorder.recordVerified`
 * does — same event type, same aggregate linkage, same four payload keys.
 */
export async function appendPaymentVerifiedEvent(
  disposable: DisposableDatabase,
  order: Pick<SeededOrder, 'orderId' | 'paymentAttemptId' | 'paymentObligationId'>,
  overrides: Record<string, unknown> = {},
): Promise<bigint> {
  const rows = await executeRaw<{ id: string }>(
    disposable.client.db,
    sql`
      INSERT INTO outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, next_attempt_at)
      VALUES
        ('payment.verified', 'PAYMENT_ATTEMPT', ${order.paymentAttemptId},
         ${JSON.stringify({
           paymentAttemptId: order.paymentAttemptId,
           paymentObligationId: order.paymentObligationId,
           obligationKind: 'DEPOSIT',
           orderId: order.orderId,
           ...overrides,
         })}::jsonb,
         1, 'PENDING', 0, now())
      RETURNING id
    `,
  );
  return BigInt((rows[0] as { id: string }).id);
}

/** The Catalog rows an approval snapshot needs to be storable. */
async function seedCatalogChain(
  disposable: DisposableDatabase,
  ids: Record<string, string>,
  suffix: string,
): Promise<void> {
  const db = disposable.client.db;

  await executeRaw(
    db,
    sql`INSERT INTO categories (id, name, slug, status, display_order, is_indexable)
        VALUES (${ids['category']}, 'Cat', ${`cat-${ids['category']}`}, 'PUBLISHED', 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO products
          (id, category_id, name, slug, base_price_amount, currency_code, status,
           is_display_out_of_stock, display_order, is_indexable)
        VALUES (${ids['product']}, ${ids['category']}, ${`Tee ${suffix}`},
                ${`tee-${ids['product']}`}, 150000, 'VND', 'PUBLISHED', false, 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO product_variants
          (id, product_id, color_name, size_label, display_order, is_active)
        VALUES (${ids['variant']}, ${ids['product']}, 'Black', 'M', 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        VALUES (${ids['asset']}, 'CATALOG_MEDIA', 'PUBLIC', ${`c/${ids['asset']}.png`},
                'image/png', 512, 'ACCEPTED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO product_sides
          (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
           physical_width_mm, physical_height_mm, px_per_mm, display_order)
        VALUES (${ids['side']}, ${ids['product']}, 'front', 'Front', ${ids['asset']},
                1000, 1200, 400, 480, 2.5, 1)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO embroidery_areas
          (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
           bound_height_px, display_order)
        VALUES (${ids['area']}, ${ids['side']}, 'chest', 'Chest', 100, 150, 300, 200, 1)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO quotations (id, code, custom_request_id, status)
        VALUES (${ids['quotation']}, ${`QUO-${ids['quotation']}`}, ${ids['request']}, 'ACCEPTED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO quotation_versions
          (id, quotation_id, version, status, quantity_total, subtotal_amount,
           manual_adjustment_amount, shipping_fee_amount, total_amount,
           deposit_percent, deposit_amount, remaining_amount, currency_code, accepted_at)
        VALUES (${ids['quotationVersion']}, ${ids['quotation']}, 1, 'ACCEPTED', 10, 1000000.00,
                0.00, 0.00, 1000000.00, 30.00, 300000.00, 700000.00, 'VND', now())`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO design_cases (id, custom_request_id)
        VALUES (${ids['designCase']}, ${ids['request']})`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO design_versions
          (id, design_case_id, version, status, design_document, document_schema_version,
           document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
           physical_width_mm, physical_height_mm, approved_at)
        VALUES (${ids['designVersion']}, ${ids['designCase']}, 1, 'APPROVED', '{}'::jsonb, 1,
                ${DOC_HASH}, ${ids['product']}, ${ids['variant']}, ${ids['side']}, ${ids['area']},
                100.00, 100.00, now())`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO approval_snapshots
          (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
           product_id, product_variant_id, product_side_id, embroidery_area_id,
           product_name, side_name, area_name, physical_width_mm, physical_height_mm,
           quantity_total, grant_id, step_up_challenge_id, approved_at)
        VALUES (${ids['approval']}, ${ids['designVersion']}, ${ids['designCase']},
                ${ids['request']}, ${ids['customer']}, ${DOC_HASH}, ${ids['product']},
                ${ids['variant']}, ${ids['side']}, ${ids['area']}, 'Tee', 'Front', 'Chest',
                100.00, 100.00, 10, ${ids['grant']}, ${ids['challenge']}, now())`,
  );
}
