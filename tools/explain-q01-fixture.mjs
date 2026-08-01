/**
 * `APP2-B04-C1` — the deterministic Q-01 fixture.
 *
 * Split from `explain-q01-access-path.mjs` to keep both files inside the
 * 400-line source limit. This half decides *what data exists*; that half
 * decides what is measured over it.
 *
 * Two properties matter more than the row counts. The categories are **not**
 * seeded — they are the four rows migration 0033 provisions (IMP-D032),
 * because that is the whole taxonomy this system can have. And every
 * `display_order` value is shared by two products, so a cursor landing on a
 * duplicated position exercises the `id` tie-breaker that ADR-DB5-001 R2
 * requires; without it a keyset page would skip or repeat a row and the plan
 * would look identical either way.
 */

/**
 * The locked APP2 taxonomy, provisioned by migration 0033 (IMP-D032).
 * Ids are the migration's own literals — the harness seeds no category.
 */
export const CANONICAL_CATEGORIES = Object.freeze([
  { id: '019a0000-0000-7000-8000-000000000001', slug: 'thu-bong' },
  { id: '019a0000-0000-7000-8000-000000000002', slug: 'khan' },
  { id: '019a0000-0000-7000-8000-000000000003', slug: 'quan-ao' },
  { id: '019a0000-0000-7000-8000-000000000004', slug: 'khac' },
]);

/** D-A representative + D-B skew, at the locked catalog scale. */
export const FIXTURE = Object.freeze({
  categories: CANONICAL_CATEGORIES.length,
  publishedProducts: 60,
  skewedCategoryShare: 40,
  draftProducts: 12,
  archivedProducts: 8,
  skewedCategorySlug: CANONICAL_CATEGORIES[0].slug,
});

function uuid(prefix, index) {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

export function categoryId(index) {
  return CANONICAL_CATEGORIES[index].id;
}

export function productId(index) {
  return uuid('22222222', index);
}

/**
 * Which category a published product belongs to.
 *
 * Index 0..39 land in the skewed category (D-B); the rest spread evenly over
 * the other three, so the filtered form has both a large and a small bucket.
 */
export function categoryOfPublished(index) {
  return index < FIXTURE.skewedCategoryShare
    ? 0
    : 1 + ((index - FIXTURE.skewedCategoryShare) % (FIXTURE.categories - 1));
}

/**
 * Two products share every `display_order` value, which is the whole point:
 * without the `id` tie-breaker a keyset cursor at a duplicated position would
 * skip or repeat a row, and the plan would still look fine.
 */
export function displayOrderOfPublished(index) {
  return Math.floor(index / 2) + 1;
}

export function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function productRow(id, categoryIndex, slug, name, status, displayOrder) {
  return `(${[
    quote(id),
    quote(categoryId(categoryIndex)),
    quote(name),
    quote(slug),
    '1000000',
    quote('VND'),
    quote(status),
    'false',
    String(displayOrder),
    'false',
  ].join(', ')})`;
}

/** The eligibility lane a public card's thumbnail must satisfy (`APP2-B04`). */
export const MEDIA_LANE = Object.freeze({
  assetKind: 'CATALOG_MEDIA',
  assetClassification: 'PRODUCTION_SENSITIVE',
  assetStatus: 'ACCEPTED',
  derivativeKind: 'THUMBNAIL',
  derivativeStatus: 'READY',
  role: 'THUMBNAIL',
});

function mediaStatements() {
  return [
    `insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
     select ('33333333-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ${quote(MEDIA_LANE.assetKind)}, ${quote(MEDIA_LANE.assetClassification)},
            'catalog/' || i || '.webp', 'image/webp', 4096, ${quote(MEDIA_LANE.assetStatus)}
     from generate_series(1, ${FIXTURE.publishedProducts}) as i`,
    `insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
     select ('44444444-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ('33333333-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ${quote(MEDIA_LANE.derivativeKind)}, ${quote(MEDIA_LANE.derivativeStatus)},
            'derivative/' || i || '.webp', false
     from generate_series(1, ${FIXTURE.publishedProducts}) as i`,
    `insert into product_media (id, product_id, asset_id, role, display_order)
     select ('55555555-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ('22222222-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ('33333333-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
            ${quote(MEDIA_LANE.role)}, 1
     from generate_series(1, ${FIXTURE.publishedProducts}) as i`,
  ];
}

/** The whole deterministic fixture, as ordinary statements. */
export function seedStatements() {
  const products = [];
  let ordinal = 1;
  for (let index = 0; index < FIXTURE.publishedProducts; index += 1, ordinal += 1) {
    products.push(
      productRow(
        productId(ordinal),
        categoryOfPublished(index),
        `san-pham-${ordinal}`,
        `Sản phẩm ${ordinal}`,
        'PUBLISHED',
        displayOrderOfPublished(index),
      ),
    );
  }
  for (let index = 0; index < FIXTURE.draftProducts; index += 1, ordinal += 1) {
    products.push(
      productRow(
        productId(ordinal),
        index % FIXTURE.categories,
        `san-pham-${ordinal}`,
        `Sản phẩm ${ordinal}`,
        'DRAFT',
        index + 1,
      ),
    );
  }
  for (let index = 0; index < FIXTURE.archivedProducts; index += 1, ordinal += 1) {
    products.push(
      productRow(
        productId(ordinal),
        index % FIXTURE.categories,
        `san-pham-${ordinal}`,
        `Sản phẩm ${ordinal}`,
        'ARCHIVED',
        index + 1,
      ),
    );
  }

  return [
    `insert into products (id, category_id, name, slug, base_price_amount, currency_code, status, is_display_out_of_stock, display_order, is_indexable) values ${products.join(', ')}`,
    ...mediaStatements(),
    'analyze',
  ];
}
