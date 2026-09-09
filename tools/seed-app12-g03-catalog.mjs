/**
 * The `APP12-G03` reconcilers: one function per business object, each of which
 * brings the live world to the state `seed-app12-g03-dataset.mjs` declares.
 *
 * ## Reconcile, never recreate (§17)
 *
 * Every function here answers the same three-way question — *absent*, *present
 * and matching*, or *present and conflicting* — and only the first two are
 * outcomes. A conflict raises `DataCollisionError` and stops the run, because the
 * alternative is a seeder that resolves someone else's data in favour of its own
 * guess. §17 is explicit that a published Product is never deleted and recreated
 * merely because rerunning that way would be easier.
 *
 * "Matching" is judged on the fields G03 owns. A field the dataset does not
 * mention is not touched: an operator who edited a description in the Admin has
 * made a deliberate change to a UAT row, and a seeder that reverted it on the
 * next run would be the thing destroying UAT state.
 *
 * ## Every write is a delivered operation
 *
 * With the two documented exceptions in `seed-app12-g03-direct.mjs`, every
 * mutation below is an `operationId` from the published OpenAPI document, sent
 * with the same optimistic-concurrency token (`expectedUpdatedAt`) an operator's
 * browser sends. That is not ceremony: it means the publication gate, the audited
 * stock ledger, the media invariants of migration `0039` and the category
 * lifecycle all judge this dataset exactly as they judge an operator's.
 */
import { waitForAssetReady } from './seed-app12-g03-admin-api.mjs';
import { ensureVariant, setLowStockThreshold } from './seed-app12-g03-direct.mjs';
import { G03_STOCK_REASON } from './seed-app12-g03-dataset.mjs';
import { generateSourceImage } from './seed-app12-g03-imagery.mjs';

/** Raised when the live world holds something G03 must not overwrite (§17). */
export class DataCollisionError extends Error {
  constructor(message) {
    super(`DATA_COLLISION: ${message}`);
    this.name = 'DataCollisionError';
  }
}

/**
 * A deterministic `Idempotency-Key` for one image.
 *
 * This is what makes the media step rerun-safe without the seeder keeping any
 * state of its own: `adminAsset_upload` is documented idempotent — "repeating
 * the request with the same Idempotency-Key and the same file returns the
 * original receipt and writes no second object" — and the generator is
 * deterministic, so the same `(product, position)` always posts the same bytes
 * under the same key and always resolves to the same Asset.
 */
export function uploadKey(productKey, position) {
  return `app12-g03.${productKey}.${String(position).padStart(2, '0')}`;
}

/**
 * Brings one category to PUBLISHED with the declared name, order and
 * indexability.
 *
 * An `ARCHIVED` row under a G03 slug is a collision rather than something to
 * revive: archival is an operator decision, and a seeder that un-archived would
 * be overruling it.
 */
export async function reconcileCategory(session, { existing, declared, log }) {
  if (existing !== undefined && existing.status === 'ARCHIVED') {
    throw new DataCollisionError(
      `category "${declared.slug}" exists but is ARCHIVED. G03 will not revive an archived row.`,
    );
  }

  let current = existing;
  if (current === undefined) {
    current = await session.request('adminCategory_create', {
      method: 'POST',
      path: '/api/admin/categories',
      body: {
        slug: declared.slug,
        name: declared.name,
        isIndexable: declared.isIndexable,
        displayOrder: declared.displayOrder,
      },
    });
    log(`category ${declared.slug} created (${current.status})`);
  }

  const drifted =
    current.name !== declared.name ||
    current.isIndexable !== declared.isIndexable ||
    current.displayOrder !== declared.displayOrder;
  if (drifted) {
    current = await session.request('adminCategory_update', {
      method: 'PATCH',
      path: `/api/admin/categories/${current.id}`,
      body: {
        expectedUpdatedAt: current.updatedAt,
        name: declared.name,
        isIndexable: declared.isIndexable,
        displayOrder: declared.displayOrder,
      },
    });
    log(`category ${declared.slug} reconciled`);
  }

  if (current.status !== 'PUBLISHED') {
    current = await session.request('adminCategory_transition', {
      method: 'POST',
      path: `/api/admin/categories/${current.id}/transitions`,
      body: { expectedUpdatedAt: current.updatedAt, action: 'PUBLISH' },
    });
    log(`category ${declared.slug} published`);
  }
  return current;
}

/**
 * Creates the Product if it is absent, and returns its detail either way.
 *
 * The name is the mechanism, not decoration: `products.slug` is server-derived
 * from the name and a rename never changes it, so the Product is created under
 * `creationName` — the Vietnamese name with a leading `UAT` — which derives the
 * marked public address, and is renamed to `name` in `reconcileProductFields`
 * below. Both halves are delivered operations; nothing writes a slug.
 */
export async function ensureProduct(session, { existing, declared, log }) {
  if (existing !== undefined) {
    if (existing.status === 'ARCHIVED') {
      throw new DataCollisionError(
        `product "${declared.slug}" exists but is ARCHIVED. G03 will not revive an archived row.`,
      );
    }
    return session.request('adminProduct_detail', {
      method: 'GET',
      path: `/api/admin/products/${existing.productId}`,
    });
  }
  const created = await session.request('adminProduct_create', {
    method: 'POST',
    path: '/api/admin/products',
    body: {
      categorySlug: declared.categorySlugValue,
      name: declared.creationName,
      description: declared.description,
    },
  });
  if (created.slug !== declared.slug) {
    throw new DataCollisionError(
      `product "${declared.creationName}" derived the slug "${created.slug}", not the declared ` +
        `"${declared.slug}". The dataset and the server's slug policy disagree.`,
    );
  }
  log(`product ${created.slug} created`);
  return created;
}

/**
 * Sets name, description, price and the media selection.
 *
 * ## The seeder owns the *set* of images, never their order
 *
 * This is the rule the first rerun of this tool taught. §7 asks an operator to
 * re-curate the eight-image Product by hand in the real Admin — promote a
 * non-first image, reorder another, save. A seeder that compared the stored
 * order against the dataset's would then find a difference on the next run and
 * "fix" it, destroying the very curation the checkpoint exists to demonstrate.
 * So the comparison is a **set** comparison: once every declared Asset is
 * attached, the arrangement belongs to whoever arranged it.
 *
 * Order is still written on the *first* pass, because at that point there is no
 * arrangement to respect — the array's order becomes the initial display order,
 * position 0 taking the primary `THUMBNAIL` role and the rest `GALLERY`, which
 * is what migration `0039`'s `ck_product_media__primary_role_at_zero` requires.
 *
 * ## Two operations, because a PUBLISHED Product is not editable
 *
 * `adminProduct_update` answers `409 PRODUCT_NOT_EDITABLE` once a Product is
 * PUBLISHED — name, description, category and price are locked there, and the
 * Admin screen renders them read-only for the same reason. Media is the one
 * thing that may still change, and `adminProductMedia_replace` (`APP12-M01.B2`)
 * is the bounded operation that changes it without unpublishing. So a DRAFT
 * takes one atomic `adminProduct_update` — the operation carries a single
 * `expectedUpdatedAt` and a second call would need a token the first just
 * invalidated — and a PUBLISHED Product takes the media-only write or nothing.
 */
export async function reconcileProductFields(session, { product, declared, assetIds, log }) {
  const attached = (product.media ?? []).map((item) => item.assetId);
  const mediaSetDiffers =
    attached.length !== assetIds.length || !assetIds.every((id) => attached.includes(id));

  if (product.status === 'PUBLISHED') {
    if (!mediaSetDiffers) {
      return product;
    }
    // The set really is wrong — an image was removed or never attached — so the
    // dataset's order is the only order available to restore it to.
    const replaced = await session.request('adminProductMedia_replace', {
      method: 'PUT',
      path: `/api/admin/products/${product.productId}/media`,
      body: { expectedUpdatedAt: product.updatedAt, mediaAssetIds: assetIds },
    });
    log(`product ${declared.slug} media replaced (published, media-only write)`);
    return { ...product, ...replaced };
  }

  const body = { expectedUpdatedAt: product.updatedAt };
  if (product.name !== declared.name) {
    body.name = declared.name;
  }
  if ((product.description ?? '') !== declared.description) {
    body.description = declared.description;
  }
  if (normalizeAmount(product.basePriceAmount) !== declared.basePriceAmount) {
    body.basePriceAmount = declared.basePriceAmount;
  }
  if (mediaSetDiffers) {
    body.mediaAssetIds = assetIds;
  }
  if (Object.keys(body).length === 1) {
    return product;
  }
  const updated = await session.request('adminProduct_update', {
    method: 'PATCH',
    path: `/api/admin/products/${product.productId}`,
    body,
  });
  log(
    `product ${declared.slug} reconciled (${Object.keys(body)
      .filter((k) => k !== 'expectedUpdatedAt')
      .join(', ')})`,
  );
  return updated;
}

/**
 * `numeric(14,2)` comes back as `320000.00`. Compared as a string against the
 * dataset's `320000`, so the fractional zeros are trimmed rather than the value
 * being parsed into a float — money never becomes a JavaScript number here, for
 * the same reason `isPublishablePrice` refuses to.
 */
export function normalizeAmount(amount) {
  if (typeof amount !== 'string') {
    return undefined;
  }
  const match = /^(\d+)(?:\.0+)?$/.exec(amount.trim());
  return match?.[1];
}

/**
 * Uploads (or re-resolves) every image one Product needs and waits for the
 * delivered pipeline to make each one publishable.
 *
 * Sequential on purpose. The images are large, inspection and derivation are the
 * worker's, and a burst of parallel uploads against a shared development stack
 * buys a few seconds at the cost of a queue depth nobody asked for.
 */
export async function ensureProductAssets(session, { declared, sharp, log }) {
  const assetIds = [];
  for (let position = 0; position < declared.mediaCount; position += 1) {
    const image = await generateSourceImage({
      sharp,
      productHue: declared.hue,
      position,
    });
    const receipt = await session.uploadAsset({
      body: image.body,
      mediaType: image.mediaType,
      fileName: `${declared.slug}-${String(position).padStart(2, '0')}.jpg`,
      idempotencyKey: uploadKey(declared.key, position),
    });
    await waitForAssetReady({ session, assetId: receipt.assetId });
    assetIds.push(receipt.assetId);
  }
  log(`product ${declared.slug}: ${String(assetIds.length)} assets ready`);
  return assetIds;
}

/**
 * Ensures one variant, its SKU, its stock quantity and its low-stock threshold.
 *
 * The split is the point. The variant is the documented exception; the SKU, the
 * price override and every unit of stock are delivered operations. Stock moves
 * by the *difference* between what is on hand and what the dataset declares, so
 * a rerun that finds the target quantity already there issues no adjustment at
 * all and writes no ledger entry — §17's "resume idempotently where safe".
 */
export async function reconcileVariantSku(
  session,
  client,
  { productId, declared, variantIndex, existingSku, log },
) {
  const { variantId, created } = await ensureVariant(client, {
    productId,
    colorName: declared.colorName,
    sizeLabel: declared.sizeLabel,
    displayOrder: variantIndex,
  });
  if (created) {
    log(`  variant ${declared.key} created (direct write — exception 1)`);
  }

  let sku = existingSku;
  if (sku === undefined) {
    const response = await session.request('adminSku_create', {
      method: 'POST',
      path: `/api/admin/products/${productId}/variants/${variantId}/skus`,
      body: {
        code: declared.sku.code,
        isActive: true,
        ...(declared.sku.priceOverrideAmount === undefined
          ? {}
          : { priceOverrideAmount: declared.sku.priceOverrideAmount }),
      },
    });
    sku = { id: response.skuId, code: response.code };
    log(`  sku ${declared.sku.code} created`);
  } else if (
    normalizeAmount(sku.price_override_amount ?? undefined) !== declared.sku.priceOverrideAmount
  ) {
    await session.request('adminSku_update', {
      method: 'PATCH',
      path: `/api/admin/skus/${sku.id}`,
      body: { priceOverrideAmount: declared.sku.priceOverrideAmount ?? null },
    });
    log(`  sku ${declared.sku.code} price override reconciled`);
  }

  const stock = await session.request('adminSkuStock_get', {
    method: 'GET',
    path: `/api/admin/skus/${sku.id}/stock`,
  });
  const delta = declared.sku.quantityOnHand - stock.quantityOnHand;
  if (delta !== 0) {
    await session.request('adminSkuStock_adjust', {
      method: 'POST',
      path: `/api/admin/skus/${sku.id}/stock/adjustments`,
      body: { delta, reason: G03_STOCK_REASON },
    });
    log(
      `  sku ${declared.sku.code} stock ${String(stock.quantityOnHand)} → ${String(declared.sku.quantityOnHand)}`,
    );
  }

  if ((stock.lowStockThreshold ?? undefined) !== declared.sku.lowStockThreshold) {
    await setLowStockThreshold(client, {
      skuId: sku.id,
      threshold: declared.sku.lowStockThreshold,
    });
    log(`  sku ${declared.sku.code} low-stock threshold set (direct write — exception 2)`);
  }

  return { variantId, skuId: sku.id, code: declared.sku.code };
}

/**
 * Publishes the Product, refusing to guess when the gate says no.
 *
 * The readiness report is read first and its unsatisfied requirement codes are
 * carried into the error, so a failure names the rule that refused rather than
 * leaving the operator to re-derive it. §12 forbids bypassing the policy with a
 * direct status write, and there is no code path here that could.
 */
export async function publishProduct(session, { product, log }) {
  if (product.status === 'PUBLISHED') {
    return product;
  }
  const readiness = await session.request('adminProduct_publicationReadiness', {
    method: 'GET',
    path: `/api/admin/products/${product.productId}/publication-readiness`,
  });
  if (!readiness.eligible) {
    const unmet = readiness.requirements
      .filter((requirement) => !requirement.satisfied)
      .map((requirement) => requirement.code);
    throw new Error(
      `APP12-G03: product ${product.slug} is not publishable. Unsatisfied: ${unmet.join(', ')}`,
    );
  }
  const published = await session.request('adminProduct_publish', {
    method: 'POST',
    path: `/api/admin/products/${product.productId}/publish`,
    body: { expectedUpdatedAt: readiness.updatedAt },
  });
  log(`product ${product.slug} published`);
  return { ...product, ...published };
}
