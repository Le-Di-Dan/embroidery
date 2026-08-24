/**
 * The APP6 hand-off world `APP7-E01` starts from, and nothing after it.
 *
 * `APP7-E01` §6 fixes the fixture boundary exactly: an **APPROVED** custom
 * request, the **exact ACCEPTED** quotation version and the **immutable
 * Approval Snapshot**. Those are three completed APP6 facts. Everything APP7
 * owns — the Order, its OrderItems, the DEPOSIT and REMAINING obligations, every
 * payment attempt, every transfer-evidence row and the `DEPOSIT_PAID`
 * transition — is produced by the delivered application during the run and is
 * never written here.
 *
 * ### Why the chain is seeded rather than replayed
 *
 * An order sits at the end of the longest chain in the system: customer →
 * request → quotation (accepted) → design case → version → approval. Replaying
 * it would rerun the whole APP6 lifecycle, which §6 forbids in as many words.
 * The shape below is the accepted `APP7-W01` fixture's
 * (`apps/worker/src/jobs/order-conversion/tests/order-conversion-fixture.ts`),
 * restated here because `packages/e2e-testing` may import neither app's test
 * sources — the same argument that file makes about `apps/api`.
 *
 * ### The money is chosen to catch a recomputation
 *
 * ```text
 * quantity            3
 * unit price          1,111,111 VND      line total  3,333,333 VND
 * total               3,333,333 VND
 * deposit_percent     35.00              deposit     1,166,667 VND
 * remaining           2,166,666 VND
 * ```
 *
 * 35 %, not `BR-005`'s 40 %: anything that recomputes the business default
 * instead of copying the accepted column lands on `1,333,333`. 35 % of the total
 * is `1,166,666.55`, so the stored figure is DB4's round-half-up result and not
 * a truncation. And `deposit + remaining = total` holds by subtraction, so a
 * converter that recomputed the remainder from the percentage is caught by the
 * deposit assertion beside it.
 *
 * ### The grant is real
 *
 * The secure link is minted by the production `SecureGrantIssuer` taken from the
 * in-process `AppModule`, so the token is peppered and digested by the code the
 * resolver verifies against. The raw token lives only in this process's memory
 * and in the browser's URL fragment; it is never logged, never written to an
 * artifact and never returned by any evidence reader.
 *
 * Test-only. Never imported by application code.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';
import { evidenceClientConfig } from '../app4/db-evidence.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/** The accepted commercial figures, as strings — `numeric(14,2)`, never a float. */
export const HANDOFF_MONEY = Object.freeze({
  quantity: 3,
  unitPriceAmount: '1111111.00',
  lineTotalAmount: '3333333.00',
  totalAmount: '3333333.00',
  depositPercent: '35.00',
  depositAmount: '1166667.00',
  remainingAmount: '2166666.00',
  currencyCode: 'VND',
});

/** A reference to the frozen document, never its content. */
const DOCUMENT_HASH = `sha256:${'7'.repeat(64)}`;

/**
 * Creates the hand-off seeder against one disposable database.
 *
 * Its own pool rather than the graph under test's, for the reason
 * `support/app4/db-evidence.mjs` states about evidence: a fixture that travelled
 * through the application's connection could be held inside a transaction the
 * application later rolls back, and the run would report a seeding failure as an
 * APP7 defect.
 */
export async function createApp7World(runtime, { databaseUrl }) {
  const { createDatabaseClient, executeRaw, newId, sql } = requireFromApi('@embroidery/database');
  const { RequestContextService } = requireFromApi(
    './dist/platform/request-context/request-context.service.js',
  );
  const requestContext = runtime.apiContext.get(RequestContextService);
  const client = createDatabaseClient(evidenceClientConfig(databaseUrl));
  const db = client.db;
  const run = async (statement) => {
    const result = await executeRaw(db, statement);
    return Array.isArray(result) ? result : (result?.rows ?? []);
  };

  /**
   * One approved commission, on one branch, and nothing APP7 owns.
   *
   * `branch: 'CATALOG'` freezes a product variant with one active SKU;
   * `'CUSTOMER_OWNED'` freezes a `customer_owned_products` row and no SKU. The
   * Catalog placement is seeded on both branches because `design_versions`
   * cannot store a version without one — only the Approval Snapshot's own branch
   * decides what the conversion reads.
   */
  async function seedApprovedHandoff({ branch = 'CATALOG', suffix = '1' } = {}) {
    const customerId = newId();
    const contactPointId = newId();
    const customRequestId = newId();
    const grantId = newId();
    const challengeId = newId();
    const quotationId = newId();
    const quotationVersionId = newId();
    const designCaseId = newId();
    const designVersionId = newId();
    const approvalSnapshotId = newId();
    const categoryId = newId();
    const productId = newId();
    const variantId = newId();
    const sideId = newId();
    const areaId = newId();
    const assetId = newId();
    const copId = newId();
    const skuId = newId();
    // Random-ish rather than derived from one id: `newId()` is UUIDv7, so two
    // rows minted in the same millisecond share their leading characters and a
    // derived slug collides on `uq_categories__slug` / `uq_products__slug`.
    const unique = `${suffix}-${newId().slice(-12)}`;
    const contactValue = `app7e01-${unique}@example.test`;
    const isCatalog = branch === 'CATALOG';

    await run(sql`INSERT INTO customers (id, display_name, verified_at)
                  VALUES (${customerId}, ${`Khách E01 ${suffix}`}, now())`);
    await run(sql`INSERT INTO customer_contact_points
                    (id, customer_id, contact_kind, normalized_value, display_value,
                     is_primary, verified_at, verified_source)
                  VALUES (${contactPointId}, ${customerId}, 'EMAIL', ${contactValue},
                          ${contactValue}, true, now(), 'APP7-E01 hand-off fixture')`);
    await run(sql`INSERT INTO custom_requests (id, code, customer_id, status)
                  VALUES (${customRequestId}, ${`REQ-${unique.toUpperCase()}`},
                          ${customerId}, 'APPROVED')`);

    // The Catalog chain the design version freezes. Seeded on both branches
    // because `design_versions` needs a placement to be storable at all.
    await run(sql`INSERT INTO assets
                    (id, kind, classification, storage_key, mime_type, size_bytes, status)
                  VALUES (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${assetId}.png`},
                          'image/png', 1024, 'ACCEPTED')`);
    await run(sql`INSERT INTO categories (id, name, slug, status, display_order, is_indexable)
                  VALUES (${categoryId}, ${'Áo'}, ${`ao-${unique}`}, 'PUBLISHED', 1, true)`);
    await run(sql`INSERT INTO products
                    (id, category_id, name, slug, base_price_amount, currency_code, status,
                     is_display_out_of_stock, display_order, is_indexable)
                  VALUES (${productId}, ${categoryId}, ${'Áo thun thêu logo'},
                          ${`ao-thun-${unique}`}, 150000, 'VND', 'PUBLISHED', false, 1, true)`);
    await run(sql`INSERT INTO product_variants
                    (id, product_id, color_name, size_label, display_order, is_active)
                  VALUES (${variantId}, ${productId}, ${'Đen'}, 'M', 1, true)`);
    await run(sql`INSERT INTO product_sides
                    (id, product_id, code, name, background_asset_id, image_width_px,
                     image_height_px, physical_width_mm, physical_height_mm, px_per_mm,
                     display_order)
                  VALUES (${sideId}, ${productId}, 'front', ${'Mặt trước'}, ${assetId},
                          1000, 1200, 400, 480, 2.5, 1)`);
    await run(sql`INSERT INTO embroidery_areas
                    (id, product_side_id, code, name, bound_x_px, bound_y_px,
                     bound_width_px, bound_height_px, display_order)
                  VALUES (${areaId}, ${sideId}, 'chest', ${'Ngực trái'}, 100, 150, 300, 200, 1)`);

    if (isCatalog) {
      await run(sql`INSERT INTO skus (id, product_variant_id, code, currency_code, is_active)
                    VALUES (${skuId}, ${variantId}, ${`SKU-${unique.toUpperCase()}`},
                            'VND', true)`);
    } else {
      await run(sql`INSERT INTO customer_owned_products
                      (id, custom_request_id, name, description)
                    VALUES (${copId}, ${customRequestId},
                            ${`Áo khoác denim của khách ${suffix}`},
                            ${'Áo khoác khách gửi tới xưởng.'})`);
    }

    // The accepted price — the exact version the order must copy.
    await run(sql`INSERT INTO quotations (id, code, custom_request_id, status)
                  VALUES (${quotationId}, ${`QUO-${unique.toUpperCase()}`},
                          ${customRequestId}, 'ACCEPTED')`);
    await run(sql`INSERT INTO quotation_versions
                    (id, quotation_id, version, status, quantity_total, subtotal_amount,
                     manual_adjustment_amount, shipping_fee_amount, total_amount,
                     deposit_percent, deposit_amount, remaining_amount, currency_code,
                     valid_from, valid_until, sent_at, accepted_at)
                  VALUES (${quotationVersionId}, ${quotationId}, 1, 'ACCEPTED',
                          ${HANDOFF_MONEY.quantity}, ${HANDOFF_MONEY.totalAmount}, 0.00, 0.00,
                          ${HANDOFF_MONEY.totalAmount}, ${HANDOFF_MONEY.depositPercent},
                          ${HANDOFF_MONEY.depositAmount}, ${HANDOFF_MONEY.remainingAmount},
                          ${HANDOFF_MONEY.currencyCode},
                          now() - interval '2 hours', now() + interval '30 days',
                          now() - interval '2 hours', now() - interval '1 hour')`);
    await run(sql`INSERT INTO quotation_line_items
                    (id, quotation_version_id, position, line_kind, description, quantity,
                     unit_price_amount, line_total_amount, currency_code)
                  VALUES (${newId()}, ${quotationVersionId}, 1, 'PRODUCT',
                          ${'Áo thun thêu logo'}, ${HANDOFF_MONEY.quantity},
                          ${HANDOFF_MONEY.unitPriceAmount}, ${HANDOFF_MONEY.lineTotalAmount},
                          ${HANDOFF_MONEY.currencyCode})`);
    await run(sql`UPDATE quotations SET current_version_id = ${quotationVersionId}
                  WHERE id = ${quotationId}`);
    await run(sql`UPDATE custom_requests SET current_quotation_id = ${quotationId}
                  WHERE id = ${customRequestId}`);

    // The approved design, and the snapshot the approval froze.
    await run(sql`INSERT INTO design_cases (id, custom_request_id)
                  VALUES (${designCaseId}, ${customRequestId})`);
    await run(sql`INSERT INTO design_versions
                    (id, design_case_id, version, status, design_document,
                     document_schema_version, document_hash, product_id, product_variant_id,
                     product_side_id, embroidery_area_id, physical_width_mm,
                     physical_height_mm, sent_at, approved_at)
                  VALUES (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
                          ${DOCUMENT_HASH}, ${productId}, ${variantId}, ${sideId}, ${areaId},
                          120.00, 80.00, now() - interval '1 hour', now())`);
    await run(sql`UPDATE design_cases SET current_version_id = ${designVersionId}
                  WHERE id = ${designCaseId}`);

    // GRD-003's evidence FK for the approval that already happened. A synthetic
    // digest: no code is minted, hashed or stored, and nothing reads it — the
    // run's own step-up is issued and verified by the real APP4 lane in the
    // browser.
    await run(sql`INSERT INTO contact_verification_challenges
                    (id, contact_point_id, contact_kind, normalized_value, purpose,
                     code_hash, status, expires_at, verified_at)
                  VALUES (${challengeId}, ${contactPointId}, 'EMAIL', ${contactValue},
                          'STEP_UP', ${`app7-e01-approval-${challengeId}`}, 'VERIFIED',
                          now() - interval '50 minutes', now() - interval '1 hour')`);
    // The grant the approval was made under. Not the run's secure link — that
    // one is issued by the production issuer in `issueSecureLink`.
    await run(sql`INSERT INTO secure_access_grants
                    (id, customer_id, custom_request_id, token_hash, scope_kind, status,
                     expires_at)
                  VALUES (${grantId}, ${customerId}, ${customRequestId},
                          ${`app7-e01-approval-grant-${grantId}`}, 'REQUEST_ACCESS',
                          'ACTIVE', now() + interval '30 days')`);

    // Two column lists rather than one nullable set: the CHECK that makes an
    // Approval Snapshot exactly one branch is what the COP case exists to
    // exercise, and a statement naming both branches' columns would be relying
    // on NULL to choose.
    const branchColumns = isCatalog
      ? sql`, product_id, product_variant_id, product_side_id, embroidery_area_id`
      : sql`, customer_owned_product_id`;
    const branchValues = isCatalog
      ? sql`, ${productId}, ${variantId}, ${sideId}, ${areaId}`
      : sql`, ${copId}`;
    await run(sql`INSERT INTO approval_snapshots
                    (id, design_version_id, design_case_id, custom_request_id, customer_id,
                     document_hash, product_name, variant_label, side_name, area_name,
                     physical_width_mm, physical_height_mm, quantity_total,
                     grant_id, step_up_challenge_id, approved_at${branchColumns})
                  VALUES (${approvalSnapshotId}, ${designVersionId}, ${designCaseId},
                          ${customRequestId}, ${customerId}, ${DOCUMENT_HASH},
                          ${isCatalog ? 'Áo thun thêu logo' : `Áo khoác denim của khách ${suffix}`},
                          ${isCatalog ? 'Đen / M' : null},
                          ${'Mặt trước'}, ${'Ngực trái'}, 120.00, 80.00,
                          ${HANDOFF_MONEY.quantity}, ${grantId}, ${challengeId},
                          now()${branchValues})`);

    return {
      branch,
      customerId,
      contactPointId,
      contactValue,
      customRequestId,
      quotationId,
      quotationVersionId,
      approvalSnapshotId,
      designVersionId,
      productId,
      productVariantId: variantId,
      skuId: isCatalog ? skuId : undefined,
      customerOwnedProductId: isCatalog ? undefined : copId,
    };
  }

  /**
   * The `design.approved` (SE-005) row `APP6-B11` writes in its approval
   * transaction.
   *
   * The payload carries the producer's own lookup fields, which is exactly what
   * `parseDesignApprovedPayload` requires — the consumer deliberately re-reads
   * every commercial fact from the rows that own it, so a wider payload here
   * would be a second opinion nothing reads.
   */
  async function appendDesignApproved(handoff) {
    const rows = await run(sql`
      INSERT INTO outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, next_attempt_at)
      VALUES ('design.approved', 'APPROVAL_SNAPSHOT', ${handoff.approvalSnapshotId},
              ${JSON.stringify({
                schemaVersion: 1,
                approvalSnapshotId: handoff.approvalSnapshotId,
                customRequestId: handoff.customRequestId,
                customerId: handoff.customerId,
              })}::jsonb,
              1, 'PENDING', 0, now())
      RETURNING id`);
    return String(rows[0]?.id ?? '');
  }

  /**
   * A committed `VERIFIED` `STEP_UP` challenge inside the live re-verification
   * window, for the cases that reach `APP7-B03` over HTTP rather than through
   * the browser.
   *
   * The same fixture `APP6-B05`, `APP6-B11` and `APP6-E01` established, and for
   * the same reason: `GRD-003` still runs for real — the production resolver
   * reads production evidence through the production window policy — while the
   * case avoids replaying an APP4 OTP journey that `E01-01` already drives end
   * to end in a browser. No code is minted, hashed or stored; the digest below
   * is synthetic and nothing reads it.
   */
  async function seedFreshStepUp(handoff, verifiedSecondsAgo = 30) {
    const challengeId = newId();
    const verifiedAt = new Date(Date.now() - verifiedSecondsAgo * 1_000);
    await run(sql`INSERT INTO contact_verification_challenges
                    (id, contact_point_id, contact_kind, normalized_value, purpose,
                     code_hash, status, expires_at, verified_at)
                  VALUES (${challengeId}, ${handoff.contactPointId}, 'EMAIL',
                          ${handoff.contactValue}, 'STEP_UP',
                          ${`app7-e01-stepup-${challengeId}`}, 'VERIFIED',
                          ${new Date(verifiedAt.getTime() + 600_000)}, ${verifiedAt})`);
    return challengeId;
  }

  return {
    seedApprovedHandoff,
    seedFreshStepUp,
    appendDesignApproved,

    /**
     * A real `REQUEST_ACCESS` grant, minted by the production issuer.
     *
     * `reissue`, not `issue`: the hand-off already carries the grant the
     * approval was made under — `approval_snapshots.grant_id` is `NOT NULL` and
     * points at it — and `CST-008` permits one `ACTIVE` grant per (customer,
     * request), so `issue` correctly refuses with `GRANT_ALREADY_ACTIVE`. That
     * refusal is the delivered rule, and reissuing is what actually happens when
     * the workshop sends a customer onward to pay: the approval link is
     * superseded and a new one is minted, through `revokeActive` →
     * `mint` → `supersede` with no fixture touching a row.
     *
     * Wrapped in a request context because that is the issuer's actual
     * contract, not a convenience: `SecureGrantAuditRecorder` calls
     * `requireRequestId()`, since every grant must be attributable to the
     * request that caused it. In production an authorized action calls this from
     * inside an HTTP request; here the harness opens the same context the
     * middleware would, and nothing about the issuance path is bypassed.
     *
     * Returns the raw token. It is a bearer credential: hand it straight into a
     * URL fragment or a request body, and never into a log, a report or an
     * assertion message.
     */
    issueSecureLink: async (handoff) => {
      const issued = await requestContext.run({ requestId: `app7-e01-${newId()}` }, () =>
        runtime.secureGrantIssuer.reissue({
          customerId: handoff.customerId,
          customRequestId: handoff.customRequestId,
          notify: false,
        }),
      );
      return {
        rawToken: issued.rawToken,
        grantId: issued.grantId,
        expiresAt: issued.expiresAt,
      };
    },

    close: async () => {
      await client.close?.();
    },
  };
}
