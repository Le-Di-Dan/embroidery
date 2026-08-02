#!/usr/bin/env node
/**
 * `APP2-S02` §25 — the disposable Product fixtures the detail run needs, and
 * the measurements taken from the laid-out page.
 *
 * Every statement targets the run's **disposable copy**, never the developer's
 * database. This is fixture setup, not a Product command: it runs no readiness
 * evaluation, honours no concurrency token, writes no Audit or Outbox row, and
 * nothing here calls it publish. It exists because the development database
 * contains no published product at all — every product there is `DRAFT` or
 * `ARCHIVED`.
 *
 * The products are synthetic; the **images are not**. Each media row points at
 * an asset whose `CATALOG_PREVIEW` derivative really exists in MinIO, so the
 * browser fetches real WebP bytes through the real publication-gated route.
 * `CATALOG_PREVIEW` and not `THUMBNAIL`: the detail projection only advertises
 * media whose *catalog-preview* derivative would actually stream, so seeding the
 * card rendition would produce a Product with an empty gallery.
 */
import { sql } from './smoke-app2-s01-discover-measure.mjs';

export { sql };

/** Stable, run-scoped ids so a re-run is idempotent and cleanup is exact. */
const PRODUCT_ID = (n) => `019b0002-0000-7000-8000-${String(n).padStart(12, '0')}`;
const MEDIA_ID = (n) => `019b0003-0000-7000-8000-${String(n).padStart(12, '0')}`;

const STORY =
  'Một buổi sáng tháng Ba, khu vườn nhỏ sau nhà bà ngoại nở rộ những khóm cúc họa mi. ' +
  'Tác phẩm bắt đầu từ mong muốn giữ lại khoảnh khắc ấy — thứ ánh sáng dịu qua giàn mướp ' +
  'và mùi đất ẩm sau cơn mưa đầu mùa.';

/**
 * The fixture matrix. Each entry is one publication/visibility case the page
 * must handle, and every one of them is a state the API can really return.
 */
export const FIXTURES = Object.freeze([
  {
    key: 'rich',
    slug: 'smoke-s02-nhieu-anh',
    name: 'Tác phẩm S02 nhiều ảnh',
    status: 'PUBLISHED',
    media: 2,
    description: STORY,
    seo: true,
  },
  {
    key: 'single',
    slug: 'smoke-s02-mot-anh',
    name: 'Tác phẩm S02 một ảnh',
    status: 'PUBLISHED',
    media: 1,
    description: STORY,
    seo: false,
  },
  {
    key: 'noMedia',
    slug: 'smoke-s02-khong-anh',
    name: 'Tác phẩm S02 không ảnh',
    status: 'PUBLISHED',
    media: 0,
    description: STORY,
    seo: false,
  },
  {
    key: 'bare',
    slug: 'smoke-s02-khong-mo-ta',
    name: 'Tác phẩm S02 không mô tả',
    status: 'PUBLISHED',
    media: 2,
    description: undefined,
    seo: false,
  },
  {
    key: 'draft',
    slug: 'smoke-s02-ban-nhap',
    name: 'Tác phẩm S02 bản nháp',
    status: 'DRAFT',
    media: 1,
    description: STORY,
    seo: false,
  },
  {
    key: 'archived',
    slug: 'smoke-s02-luu-tru',
    name: 'Tác phẩm S02 lưu trữ',
    status: 'ARCHIVED',
    media: 1,
    description: STORY,
    seo: false,
  },
  {
    key: 'hiddenCategory',
    slug: 'smoke-s02-danh-muc-an',
    name: 'Tác phẩm S02 danh mục ẩn',
    status: 'PUBLISHED',
    media: 1,
    description: STORY,
    seo: false,
    hiddenCategory: true,
  },
]);

/**
 * The role each media slot is attached under, and why the gallery caps at two.
 *
 * The development database holds exactly **one** asset with a `READY`,
 * unwatermarked `CATALOG_PREVIEW` derivative, and both `assets.storage_key` and
 * `asset_derivatives.storage_key` are unique — so that asset cannot be cloned to
 * widen the pool without inventing a storage object that does not exist. What it
 * *can* do is back two media rows, because `uq_product_media__product_asset_role`
 * is unique per **role**. Each row gets its own `product_media.id` and therefore
 * its own catalog-preview address, so the page really renders an ordered
 * multi-image gallery streaming real bytes.
 *
 * Two is enough to exercise ordering, selection, arrow navigation and the
 * previous/next boundaries. A three-image case would need a third real image in
 * object storage, which this run will not fabricate.
 */
const MEDIA_SLOT_ROLES = ['GALLERY', 'THUMBNAIL'];

/** A slug that is syntactically valid but names nothing. */
export const UNKNOWN_SLUG = 'smoke-s02-khong-ton-tai';
/** A slug the route must reject before it ever reaches the API. */
export const MALFORMED_SLUG = 'Khong Hop Le';

/** The disposable category used to prove a non-public category still 404s. */
const HIDDEN_CATEGORY_ID = '019b0004-0000-7000-8000-000000000001';
const HIDDEN_CATEGORY_SLUG = 'smoke-s02-an';

/**
 * Assets whose `CATALOG_PREVIEW` derivative is `READY` and unwatermarked — the
 * only ones the detail delivery route will actually serve bytes for.
 */
function deliverableAssets() {
  const rows = sql(`
    select distinct a.id
    from assets a
    join asset_derivatives d on d.asset_id = a.id
    where a.status = 'ACCEPTED' and d.kind = 'CATALOG_PREVIEW' and d.status = 'READY'
      and d.is_watermarked = false
    order by a.id`);
  return rows === '' ? [] : rows.split('\n').map((line) => line.trim());
}

function quote(value) {
  return value === undefined ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

/** Seeds the whole matrix into the disposable copy. Idempotent. */
export function seedDetailFixtures() {
  const assets = deliverableAssets();
  if (assets.length === 0) {
    throw new Error(
      'The disposable copy has no ACCEPTED asset with a READY CATALOG_PREVIEW derivative.',
    );
  }

  // A published product in a category that is not itself published. The API
  // collapses this into the same 404 as a missing product, and the page must
  // not widen that back out.
  sql(`insert into categories (id, slug, name, status, display_order, is_indexable, created_at, updated_at)
       values ('${HIDDEN_CATEGORY_ID}', '${HIDDEN_CATEGORY_SLUG}', 'Danh mục ẩn S02', 'DRAFT', 900, false, now(), now())
       on conflict (id) do nothing`);

  const products = [];
  const media = [];
  let mediaCounter = 0;

  FIXTURES.forEach((fixture, index) => {
    const id = PRODUCT_ID(index + 1);
    const category = fixture.hiddenCategory
      ? `'${HIDDEN_CATEGORY_ID}'`
      : `(select id from categories where slug = 'thu-bong')`;
    products.push(
      `('${id}', ${category}, ${quote(fixture.name)}, '${fixture.slug}', ${quote(fixture.description)}, ` +
        `460000, 'VND', '${fixture.status}', false, ${index + 1}, true, ` +
        `${fixture.seo ? quote(`${fixture.name} — SEO`) : 'null'}, ` +
        `${fixture.seo ? quote('Mô tả SEO cho tác phẩm thử nghiệm S02.') : 'null'}, now(), now())`,
    );
    for (let slot = 0; slot < fixture.media; slot += 1) {
      mediaCounter += 1;
      const assetId = assets[slot % assets.length];
      // One asset can back two media rows because the uniqueness is per ROLE
      // (uq_product_media__product_asset_role). See MEDIA_SLOT_ROLES.
      media.push(
        `('${MEDIA_ID(mediaCounter)}', '${id}', '${assetId}', '${MEDIA_SLOT_ROLES[slot]}', ${slot + 1}, now(), now())`,
      );
    }
  });

  sql(`insert into products (id, category_id, name, slug, description, base_price_amount,
        currency_code, status, is_display_out_of_stock, display_order, is_indexable,
        seo_title, seo_description, created_at, updated_at)
       values ${products.join(', ')}
       on conflict (id) do nothing`);
  sql(`insert into product_media (id, product_id, asset_id, role, display_order, created_at, updated_at)
       values ${media.join(', ')}
       on conflict (id) do nothing`);

  return { products: FIXTURES.length, media: media.length, assets: assets.length };
}

/** How many media rows the detail projection will advertise for a slug. */
export function deliverableMediaCount(slug) {
  return Number(
    sql(`select count(*)
         from product_media pm
         join products p on p.id = pm.product_id and p.slug = '${slug}'
         join assets a on a.id = pm.asset_id and a.status = 'ACCEPTED'
         where exists (select 1 from asset_derivatives d
                       where d.asset_id = a.id and d.kind = 'CATALOG_PREVIEW'
                         and d.status = 'READY' and d.is_watermarked = false)`),
  );
}

/** The persisted media addresses for a slug, in display order. */
export function mediaPaths(slug) {
  const rows = sql(`select pm.id
       from product_media pm
       join products p on p.id = pm.product_id and p.slug = '${slug}'
       order by pm.display_order, pm.id`);
  if (rows === '') return [];
  return rows
    .split('\n')
    .map((line) => line.trim())
    .map((id) => `/api/public/products/${slug}/media/${id}/catalog-preview`);
}

/** Durable visibility: move a published fixture to DRAFT, as an operator would. */
export function unpublish(slug) {
  sql(`update products set status = 'DRAFT', updated_at = now() where slug = '${slug}'`);
  return sql(`select status from products where slug = '${slug}'`);
}

/** Remove every row this harness created. The copy is thrown away anyway. */
export function cleanupDetailFixtures() {
  sql(
    `delete from product_media where product_id in (select id from products where slug like 'smoke-s02-%')`,
  );
  sql(`delete from products where slug like 'smoke-s02-%'`);
  sql(`delete from categories where id = '${HIDDEN_CATEGORY_ID}'`);
}

/** The computed CSS width of the story paragraph, or null when absent. */
export function measureStory(page) {
  return page.evaluate(() => {
    const body = document.querySelector('.product-detail__story-body');
    if (body === null) return null;
    const rect = body.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      left: Math.round(rect.left),
      lines: Math.round(rect.height / parseFloat(getComputedStyle(body).lineHeight || '1')),
      clamped: getComputedStyle(body).webkitLineClamp !== 'none',
      text: body.textContent ?? '',
    };
  });
}

/**
 * Interactive controls inside the Product Detail page that miss the 44px target.
 *
 * Scoped to `.product-detail` deliberately. The shell's skip link and brand link
 * are approved APP1 surface which this checkpoint may not alter, and measuring
 * them here would report an APP1 fact as an S02 failure. They are recorded in
 * the completion report instead.
 */
export function undersizedControls(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.product-detail a, .product-detail button'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.height < 44;
      })
      .map((element) => `${element.tagName}:${(element.textContent ?? '').trim().slice(0, 24)}`),
  );
}

/**
 * The Product Detail content band as laid out: its gutters relative to the
 * viewport, its usable width, and the width of each element the approved frame
 * places inside it.
 *
 * Read from real boxes, never from the stylesheet that produced them — the whole
 * point of `APP2-S02-C1` is that a documented 24px/342px band and a rendered one
 * had drifted apart.
 */
export function measureContentBand(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.product-detail');
    if (root === null) return null;
    const style = getComputedStyle(root);
    const rect = root.getBoundingClientRect();
    const padLeft = parseFloat(style.paddingLeft);
    const padRight = parseFloat(style.paddingRight);
    const width = (selector) => {
      const element = document.querySelector(selector);
      return element === null ? null : Math.round(element.getBoundingClientRect().width);
    };
    return {
      left: Math.round(rect.left + padLeft),
      right: Math.round(window.innerWidth - (rect.right - padRight)),
      content: Math.round(rect.width - padLeft - padRight),
      story: width('.product-detail__story-body'),
      stage: width('.product-detail__stage'),
      thumbnails: width('.product-detail__thumbnails'),
      breadcrumb: width('.product-detail__breadcrumb'),
      identity: width('.product-detail__identity'),
      continueSection: width('.product-detail__continue'),
    };
  });
}

/** The shell's own content width at the current viewport. */
export function contentWidth(page) {
  return page.evaluate(() => {
    const inner = document.querySelector('.storefront-shell__main-inner');
    if (inner === null) return 0;
    const style = getComputedStyle(inner);
    return Math.round(
      inner.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    );
  });
}

/** Whether the document scrolls horizontally at the current viewport. */
export function horizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}
