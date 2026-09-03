/**
 * TEST-ONLY historical fixture: the four category rows migration `0033`
 * provisioned (`APP12-C01-C1`).
 *
 * ## Why this is not runtime code
 *
 * These four values used to be exported from the runtime schema as
 * `APP2_CATEGORY_SLUGS` / `APP2_CATEGORY_TAXONOMY`, and the API, the OpenAPI
 * enum, the generated client, the Admin option list and the Discover chips all
 * derived from them. That made source code a **second category authority**
 * alongside the `categories` table — and the two had already diverged: the
 * database held `ao-thun` while the type said it could not exist.
 *
 * `APP12-C01-C1` locks `CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE`. Code owns
 * the *shape* of a category, the slug syntax, the status vocabulary and the
 * visibility rules; the **values** live in rows. So this data has exactly one
 * legitimate remaining reader: the suites that assert migration `0033` — a
 * historical, already-applied, forward-only migration — put the rows it says it
 * put, and that a database upgraded across it converges on the same state.
 *
 * ## Rules
 *
 * - **Never import this from production runtime code.** The anti-hardcode gate
 *   (`tools/check-category-source-of-truth.mjs`) fails the build if anything
 *   under an application's `src/` reaches for it.
 * - It is not a default, a fallback, a seed for new environments or a starting
 *   taxonomy. It is a record of what one migration did on one date.
 * - It must not grow. A category added after `0033` is data, and belongs in a
 *   database row, never here.
 *
 * The `__historical__` directory name is deliberate: it is the first thing a
 * reader sees, and it is what the gate matches on.
 */
import type { CategoryState } from '../categories';

/** One historical row, exactly as migration `0033` inserted it. */
export interface App2HistoricalCategory {
  /** Deterministic id, fixed in migration 0033 and identical on every machine. */
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly displayOrder: number;
}

/**
 * The four rows migration `0033` inserted, in the order it inserted them.
 *
 * Frozen historical data. The migration SQL is the authority; this is a
 * transcription of it so an upgrade suite can compare against something typed
 * rather than re-parsing SQL.
 */
export const APP2_HISTORICAL_CATEGORIES: readonly App2HistoricalCategory[] = [
  {
    id: '019a0000-0000-7000-8000-000000000001',
    slug: 'thu-bong',
    name: 'Thú bông',
    displayOrder: 10,
  },
  { id: '019a0000-0000-7000-8000-000000000002', slug: 'khan', name: 'Khăn', displayOrder: 20 },
  {
    id: '019a0000-0000-7000-8000-000000000003',
    slug: 'quan-ao',
    name: 'Quần áo',
    displayOrder: 30,
  },
  { id: '019a0000-0000-7000-8000-000000000004', slug: 'khac', name: 'Khác', displayOrder: 90 },
] as const;

/** The slugs of the historical rows. Historical data, never a contract. */
export const APP2_HISTORICAL_CATEGORY_SLUGS: readonly string[] = APP2_HISTORICAL_CATEGORIES.map(
  (category) => category.slug,
);

/** The status migration `0033` gave every row it inserted. */
export const APP2_HISTORICAL_CATEGORY_STATUS = 'PUBLISHED' as const satisfies CategoryState;
