import Link from 'next/link';

import { toDiscoverChips, type DiscoverCategory } from '../model/discover-categories';
import { DISCOVER_COPY } from '../model/discover-copy';
import { buildDiscoverHref } from '../model/discover-route';

interface DiscoverCategoryNavProps {
  /**
   * The public category inventory, or `undefined` when it could not be read.
   *
   * `undefined` is *unknown*, not *empty*: it renders the unavailable notice,
   * never a remembered list of categories.
   */
  readonly categories: readonly DiscoverCategory[] | undefined;
  /** The category the server resolved from the URL; `undefined` means "all". */
  readonly activeSlug: string | undefined;
}

/**
 * Category guidance as real links (UI02 `214:587` / `224:890` / `226:1052`).
 *
 * A Server Component: the selection lives in the URL and the inventory is
 * fetched in the same request, so the chips and the matching feed are decided
 * in one render. Nothing is chosen on the client, which is why there is no
 * filter flash and why the browser's back and forward buttons work with no
 * extra code.
 *
 * ## The chips are data
 *
 * Every chip after `Tất cả` is a row from `GET /api/public/categories`: its
 * label is `category.name`, its position is the API's `display_order` ordering,
 * and its href is built from `category.slug`. There is no category list in this
 * file, and there must never be one again — a compiled chip row cannot show a
 * category the operator added after the build, which is exactly what
 * `APP12-C01-C1` corrected.
 *
 * When the inventory cannot be read the row degrades to a short notice rather
 * than to a remembered taxonomy. A stale list would offer filters for
 * categories that may since have been archived, and would quietly reintroduce
 * the second source of truth.
 *
 * UI02 draws eleven chips — three dropdowns (`Phong cách`, `Chủ đề`,
 * `Bộ sưu tập`) and seven theme chips. The backend supports none of them: it
 * filters by category and nothing else. The chip treatment is reused; the
 * unsupported chips are omitted rather than rendered inert, because a chip that
 * cannot filter is a promise the backend cannot keep.
 *
 * The active chip is not distinguished by colour alone — it also carries
 * `aria-current="page"` and a heavier label — and every chip is a normal link,
 * so the whole control works before hydration.
 */
export function DiscoverCategoryNav({ categories, activeSlug }: DiscoverCategoryNavProps) {
  if (categories === undefined) {
    return (
      <nav className="discover__categories" aria-label={DISCOVER_COPY.categoryNavLabel}>
        <p className="discover__category-unavailable">{DISCOVER_COPY.categoryUnavailable}</p>
      </nav>
    );
  }

  return (
    <nav className="discover__categories" aria-label={DISCOVER_COPY.categoryNavLabel}>
      <ul className="discover__category-list">
        {toDiscoverChips(categories).map((chip) => {
          const isActive = chip.slug === activeSlug;
          return (
            <li key={chip.id}>
              <Link
                href={buildDiscoverHref(chip.slug)}
                className={`discover__chip${isActive ? ' discover__chip--active' : ''}`}
                {...(isActive ? { 'aria-current': 'page' as const } : {})}
              >
                {chip.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
