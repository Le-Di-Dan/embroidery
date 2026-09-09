/**
 * The `APP12-M01.E1` disposable-world mutations and inspections.
 *
 * Split out of `m01e1-acceptance-fixture.mjs` when that file crossed the
 * 400-line source limit, and split **here** rather than at an arbitrary line
 * because these are a different job from seeding: the fixture decides what world
 * exists before the run, and this file is how the run damages that world on
 * purpose and then reads the damage back out of the database.
 *
 * Every function refuses any database not named `embroidery_db7_*`, for the
 * reason the fixture records: these are catalog rows, and once written they are
 * indistinguishable from a Product an operator authored
 * (`VALIDATION_GOVERNANCE.md` §3A.4, and the `APP12-G03` reservation).
 *
 * Reads go straight to SQL rather than through the API on purpose. §12 requires
 * proving a public read mutated nothing, and an assertion made through the same
 * projection the read went through would only prove the projection agrees with
 * itself.
 */
import pg from 'pg';

const { Client } = pg;

/**
 * Refuses to touch anything but a disposable database.
 *
 * `createDisposableDatabase` names every database it makes `embroidery_db7_*`
 * and the persistent development database is plain `embroidery`. Checking the
 * name is what keeps a mistyped port from pointing this at the shared stack.
 */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to mutate "${name}" for APP12-M01.E1: only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

/**
 * Sets one Asset's lifecycle state, which is the real Asset authority the public
 * eligibility predicate reads.
 *
 * `assetEligibility()` compares `assets.status` to `ACCEPTED` exactly, so
 * `REJECTED` is what makes an image ineligible for every public surface at once
 * — the card, the detail array, `og:image` and the JSON-LD image list — while
 * leaving `product_media` completely untouched. That is precisely the state §12
 * asks for, and the reverse call restores it.
 *
 * No application path produces either transition on demand, so both are written
 * directly into this run's disposable database.
 */
export async function setAssetStatus({ databaseUrl, assetId, status }) {
  assertDisposable(databaseUrl);
  if (status !== 'ACCEPTED' && status !== 'REJECTED') {
    throw new Error(`Refusing to write an unexpected Asset status: ${String(status)}`);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('update assets set status = $2 where id = $1', [assetId, status]);
  } finally {
    await client.end();
  }
}

/**
 * Takes one derivative kind away from an Asset, leaving the Asset `ACCEPTED`.
 *
 * §10's "missing required derivative" case, and it is a genuinely different
 * state from a rejected Asset: the Asset is still in the catalog-media lane and
 * still accepted, but `PRODUCT_PUBLICATION_DERIVATIVE_KINDS` can no longer be
 * satisfied for it, so a PUBLISHED selection that includes it is refused as
 * `PRODUCT_MEDIA_NOT_PUBLISHABLE` rather than as an unavailable Asset. Only the
 * row is removed — the stored object is left where it is, because no read path
 * can reach an object with no row and deleting it would be work with no
 * assertion behind it.
 *
 * Returns what it removed, so the caller can put it back and prove the refusal
 * was about the derivative rather than about the Asset.
 */
export async function dropDerivative({ databaseUrl, assetId, kind }) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      'delete from asset_derivatives where asset_id = $1 and kind = $2 returning *',
      [assetId, kind],
    );
    if (rows.length === 0) {
      throw new Error(`Asset ${assetId} carried no ${kind} derivative to remove.`);
    }
    return rows[0];
  } finally {
    await client.end();
  }
}

/**
 * Puts a removed derivative row back, exactly as it was.
 *
 * §10's cases run in one serial file against one Product, so a case that left an
 * Asset permanently unpublishable would decide every case after it — the
 * stale-token journey would be refused for the previous journey's reason and
 * would prove nothing about concurrency. Restoring is what keeps each refusal
 * attributable to its own cause.
 */
export async function restoreDerivative({ databaseUrl, row }) {
  assertDisposable(databaseUrl);
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${String(index + 1)}`);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `insert into asset_derivatives (${columns.map((c) => `"${c}"`).join(', ')})
       values (${placeholders.join(', ')})`,
      columns.map((column) => row[column]),
    );
  } finally {
    await client.end();
  }
}

/**
 * Which Product, if any, a media association row belongs to.
 *
 * Diagnostic only, and it exists because "the surfaces disagree with storage"
 * and "the harness read a different Product" fail identically at the assertion.
 * Naming the owner of the id the page actually rendered separates them in one
 * run instead of several.
 */
export async function describeSlug({ databaseUrl, slug }) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select p.id, p.slug, p.status, p.category_id as "categoryId",
              (select count(*) from product_media m where m.product_id = p.id) as "mediaRows"
         from products p where p.slug = $1`,
      [slug],
    );
    return rows;
  } finally {
    await client.end();
  }
}

export async function describeMediaOwners({ databaseUrl, mediaId }) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select p.id as "productId", p.slug, p.status, m.role, m.display_order as "displayOrder",
              m.asset_id as "assetId"
         from product_media m
         join products p on p.id = m.product_id
        where m.id = $1`,
      [mediaId],
    );
    return rows;
  } finally {
    await client.end();
  }
}

/**
 * The stored `product_media` rows for one Product, in position order.
 *
 * §12 requires proving that a public read changed **nothing** in storage, and
 * that can only be proved by reading storage directly: an assertion made through
 * the same API the read went through would be asserting the projection agrees
 * with itself.
 */
export async function readStoredMedia({ databaseUrl, productId }) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // `id` as well as `asset_id`, and the distinction matters: the public
    // contract addresses media by the **association row's** id
    // (`publicProductMediaPath({ productMediaId })`), never by the Asset's. A
    // comparison against `asset_id` would report a mismatch on a page that is
    // perfectly correct.
    const { rows } = await client.query(
      `select id as "mediaId", asset_id as "assetId", role, display_order as "displayOrder"
         from product_media
        where product_id = $1
        order by display_order asc`,
      [productId],
    );
    return rows;
  } finally {
    await client.end();
  }
}
