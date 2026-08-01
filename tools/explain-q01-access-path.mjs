/**
 * `APP2-B04-C1` — the Q-01 access-path measurement, expressed as pure values.
 *
 * Everything that decides *what* is measured — the disposable container, the
 * deterministic fixture, the four statements and how a captured plan is
 * summarised — lives here with no Docker call in sight, so
 * `explain-q01-access-path.test.mjs` can assert it on every `pnpm test` rather
 * than only on a machine with Docker running. The orchestration that executes
 * it is `explain-q01-public-catalog.mjs`.
 *
 * The data it is measured over lives in `explain-q01-fixture.mjs`, which the
 * 400-line source limit separated out.
 *
 * The disposable database uses `POSTGRES_HOST_AUTH_METHOD=trust`, so no
 * password exists to pass, log or leak. It listens on loopback only and is
 * removed when the run ends.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_CATEGORIES, FIXTURE, MEDIA_LANE, quote } from './explain-q01-fixture.mjs';

export * from './explain-q01-fixture.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mirrors the tracked development image exactly; never a floating tag. */
export const POSTGRES_IMAGE = 'postgres:16.14-alpine';
export const CONTAINER_PREFIX = 'embroidery-b04c1-explain';
export const DB_USER = 'embroidery';
export const DB_NAME = 'embroidery';

/** Bounded waits — a hung container must fail the run, never park it. */
export const READY_TIMEOUT_MS = 120_000;
export const READY_POLL_MS = 1_000;

/** `DEFAULT_PAGE_SIZE` from `packages/persistence/src/query/keyset-cursor.ts`. */
export const PAGE_SIZE = 20;

export function containerName(seed) {
  return `${CONTAINER_PREFIX}-${seed}`;
}

/** A throwaway PostgreSQL on loopback with no password in existence. */
export function runArgs(name) {
  return [
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1::5432',
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env',
    `POSTGRES_USER=${DB_USER}`,
    '--env',
    `POSTGRES_DB=${DB_NAME}`,
    POSTGRES_IMAGE,
  ];
}

export function removeArgs(name) {
  return ['rm', '--force', '--volumes', name];
}

export function portArgs(name) {
  return ['port', name, '5432/tcp'];
}

/** `docker port` prints `127.0.0.1:49876` — take the port only. */
export function parsePublishedPort(output) {
  const match = output
    .trim()
    .split('\n')[0]
    ?.match(/:(\d+)\s*$/);
  if (match === null || match === undefined) {
    throw new Error(`could not read a published port from "${output.trim()}"`);
  }
  return Number(match[1]);
}

/** No password component: the disposable database trusts loopback. */
export function databaseUrl(port) {
  return `postgres://${DB_USER}@127.0.0.1:${port}/${DB_NAME}`;
}

/** `psql` inside the container, so no client dependency is added to the repo. */
export function psqlArgs(name, statements) {
  return [
    'exec',
    name,
    'psql',
    '--username',
    DB_USER,
    '--dbname',
    DB_NAME,
    '--no-align',
    '--tuples-only',
    ...statements.flatMap((statement) => ['--command', statement]),
  ];
}

/** No argument may carry a credential (CLAUDE.md §8a). */
export function argsAreCredentialFree(args) {
  return !args.some((arg) => /password|passwd|secret|token|credential/i.test(String(arg)));
}

/**
 * The correlated thumbnail subquery, byte-for-byte in shape with
 * `drizzle-public-product.repository.ts`'s `deliverableMediaId`.
 */
const THUMBNAIL_SUBQUERY = `(
    select pm.id from product_media pm
    join assets a on a.id = pm.asset_id
    join asset_derivatives ad on ad.asset_id = a.id
    where pm.product_id = p.id
      and pm.role = ${quote(MEDIA_LANE.role)}
      and a.kind = ${quote(MEDIA_LANE.assetKind)}
      and a.classification = ${quote(MEDIA_LANE.assetClassification)}
      and a.status = ${quote(MEDIA_LANE.assetStatus)}
      and a.deleted_at is null
      and ad.kind = ${quote(MEDIA_LANE.derivativeKind)}
      and ad.status = ${quote(MEDIA_LANE.derivativeStatus)}
      and ad.is_watermarked = false
      and ad.storage_key is not null
    order by pm.display_order asc, pm.id asc
    limit 1
  )`;

/**
 * The Q-01 list statement as the repository issues it.
 *
 * Note what the category filter actually is: `categories.slug = ?` across the
 * join, **not** an equality on `products.category_id`. Whether the planner
 * turns that into an IDX-065 leading-prefix probe is precisely the question
 * this harness measures instead of assuming.
 */
export function listStatement({ categorySlug, after } = {}) {
  const conditions = ["p.status = 'PUBLISHED'", "c.status = 'PUBLISHED'", 'c.archived_at is null'];
  if (categorySlug !== undefined) conditions.push(`c.slug = ${quote(categorySlug)}`);
  if (after !== undefined) {
    conditions.push(
      `(p.display_order > ${after.displayOrder} or (p.display_order = ${after.displayOrder} and p.id > ${quote(after.id)}))`,
    );
  }
  return `select p.id, p.display_order, p.slug, p.name, p.base_price_amount, p.currency_code,
       p.is_display_out_of_stock, c.slug as category_slug, c.name as category_name,
       ${THUMBNAIL_SUBQUERY} as thumbnail_product_media_id
  from products p
  join categories c on c.id = p.category_id
 where ${conditions.join('\n   and ')}
 order by p.display_order asc, p.id asc
 limit ${PAGE_SIZE}`;
}

/**
 * A reference form the delivered contract does **not** issue: the same page
 * with `category_id` supplied as a constant instead of resolved from
 * `categories.slug` across the join.
 *
 * It exists to answer one question precisely — what IDX-065's leading-prefix
 * ordering can do when the planner is given the equality it was designed
 * around — so the difference between "the index cannot serve this" and "the
 * delivered query does not hand the planner a constant" is measured rather
 * than argued.
 */
export function categoryConstantStatement(id) {
  return `select p.id, p.display_order, p.slug
  from products p
 where p.status = 'PUBLISHED' and p.category_id = ${quote(id)}
 order by p.display_order asc, p.id asc
 limit ${PAGE_SIZE}`;
}

/** The row a continuation page resumes after: the last row of page one. */
export function lastRowStatement(options) {
  return `select page.display_order || ' ' || page.id
    from (${listStatement(options)}) as page
   order by page.display_order desc, page.id desc limit 1`;
}

export function explain(statement) {
  return `explain (analyze, buffers, format json) ${statement}`;
}

/**
 * `psql` prints a `SET` tag before the plan when the probe disables sequential
 * scans in the same session, so the JSON starts partway through the output.
 */
export function extractPlanJson(output) {
  const start = output.indexOf('[');
  if (start < 0) throw new Error(`no EXPLAIN JSON in psql output: ${output.trim().slice(0, 120)}`);
  return JSON.parse(output.slice(start));
}

/** The four measured cases, in report order. */
export function scenarios({ filteredAfter, unfilteredAfter }) {
  return [
    { ref: 'Q01-U1', form: 'unfiltered', page: 'first', statement: listStatement({}) },
    {
      ref: 'Q01-U2',
      form: 'unfiltered',
      page: 'continuation',
      statement: listStatement({ after: unfilteredAfter }),
    },
    {
      ref: 'Q01-F1',
      form: 'category-filtered',
      page: 'first',
      statement: listStatement({ categorySlug: FIXTURE.skewedCategorySlug }),
    },
    {
      ref: 'Q01-F2',
      form: 'category-filtered',
      page: 'continuation',
      statement: listStatement({
        categorySlug: FIXTURE.skewedCategorySlug,
        after: filteredAfter,
      }),
    },
  ];
}

function walk(node, visit, inSubplan = false) {
  // The node carrying `Parent Relationship: SubPlan` is itself the subquery's
  // root, so the flag has to be raised before visiting it, not after.
  const subplan = inSubplan || node['Parent Relationship'] === 'SubPlan';
  visit(node, subplan);
  for (const child of node['Plans'] ?? []) walk(child, visit, subplan);
}

const LEAF_SCANS = new Set(['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan']);

/**
 * Plan shape, buffers and timing — the facts §7 of the correction requires.
 *
 * The ordering access path and the per-card thumbnail subquery are counted
 * apart on purpose. Folding them together would hide the only two things worth
 * knowing: whether the page costs one pass over the catalog, and whether the
 * subquery stays bounded by the page rather than becoming an N+1.
 */
export function summarizePlan(explainJson) {
  const root = explainJson[0]['Plan'];
  const nodes = [];
  const outerNodes = [];
  const indexes = [];
  let outerRowsScanned = 0;
  let subplanRowsScanned = 0;
  let subplanLoops = 0;
  let sharedHit = 0;
  let sharedRead = 0;
  walk(root, (node, inSubplan) => {
    nodes.push(node['Node Type']);
    if (!inSubplan) outerNodes.push(node['Node Type']);
    if (node['Index Name'] !== undefined) indexes.push(node['Index Name']);
    if (LEAF_SCANS.has(node['Node Type'])) {
      const rows = (node['Actual Rows'] ?? 0) * (node['Actual Loops'] ?? 1);
      if (inSubplan) {
        subplanRowsScanned += rows;
        subplanLoops = Math.max(subplanLoops, node['Actual Loops'] ?? 0);
      } else {
        outerRowsScanned += rows;
      }
    }
    sharedHit += node['Shared Hit Blocks'] ?? 0;
    sharedRead += node['Shared Read Blocks'] ?? 0;
  });
  return {
    nodes,
    outerNodes,
    indexes: [...new Set(indexes)],
    hasSort: outerNodes.includes('Sort') || outerNodes.includes('Incremental Sort'),
    hasSeqScan: outerNodes.includes('Seq Scan'),
    rowsReturned: root['Actual Rows'] ?? 0,
    outerRowsScanned,
    subplanRowsScanned,
    subplanLoops,
    sharedHit,
    sharedRead,
    executionMs: explainJson[0]['Execution Time'],
    planningMs: explainJson[0]['Planning Time'],
  };
}

/** Every relation the ordering path may legitimately pass over once. */
const OUTER_RELATION_BUDGET = 3;

/**
 * The verdict rule.
 *
 * A sequential scan is *not* a failure here — ADR-DB5-004 R8 and EXPLAIN
 * scenario E1 both say so at this cardinality, and `DB9_QUERY_PLAN_CATALOG`
 * already measured exactly that for the Q-01 shape. What would be a failure is
 * a plan that cannot serve the page at all: the ordering path passing over the
 * catalog many times, or the thumbnail subquery running more often than there
 * are rows on the page — the N+1 this repository's design forbids.
 */
export function accessPathVerdict(summary) {
  const totalProducts =
    FIXTURE.publishedProducts + FIXTURE.draftProducts + FIXTURE.archivedProducts;
  if (summary.outerRowsScanned > OUTER_RELATION_BUDGET * totalProducts) {
    return { accepted: false, reason: 'the ordering path passes over the catalog repeatedly' };
  }
  if (summary.subplanLoops > PAGE_SIZE) {
    return { accepted: false, reason: `thumbnail subquery ran ${summary.subplanLoops} times` };
  }
  return {
    accepted: true,
    reason: summary.hasSeqScan
      ? 'sequential scan over an MVP-scale relation, accepted (ADR-DB5-004 R8, E1)'
      : 'index-driven page',
  };
}
