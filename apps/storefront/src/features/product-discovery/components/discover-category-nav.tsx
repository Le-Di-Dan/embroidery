import Link from 'next/link';

import { DISCOVER_CATEGORIES, type DiscoverCategorySlug } from '../model/discover-categories';
import { DISCOVER_COPY } from '../model/discover-copy';
import { buildDiscoverHref } from '../model/discover-route';

interface DiscoverCategoryNavProps {
  /** The category the server resolved from the URL; `undefined` means "all". */
  readonly activeSlug: DiscoverCategorySlug | undefined;
}

/**
 * Category guidance as real links (UI02 `214:587` / `224:890` / `226:1052`).
 *
 * A Server Component: the selection lives in the URL, so the active chip is
 * decided during the same render that fetches the matching page. Nothing is
 * chosen on the client, which is why there is no filter flash and why the
 * browser's back and forward buttons work with no extra code.
 *
 * UI02 draws eleven chips — three dropdowns (`Phong cách`, `Chủ đề`,
 * `Bộ sưu tập`) and seven theme chips. `APP2-B04` supports none of them: it
 * filters by the four fixed categories and nothing else. The chip treatment is
 * reused; the unsupported chips are omitted rather than rendered inert, because
 * a chip that cannot filter is a promise the backend cannot keep.
 *
 * The active chip is not distinguished by colour alone — it also carries
 * `aria-current="page"` and a heavier label — and every chip is a normal link,
 * so the whole control works before hydration.
 */
export function DiscoverCategoryNav({ activeSlug }: DiscoverCategoryNavProps) {
  return (
    <nav className="discover__categories" aria-label={DISCOVER_COPY.categoryNavLabel}>
      <ul className="discover__category-list">
        {DISCOVER_CATEGORIES.map((category) => {
          const isActive = category.slug === activeSlug;
          return (
            <li key={category.id}>
              <Link
                href={buildDiscoverHref(category.slug)}
                className={`discover__chip${isActive ? ' discover__chip--active' : ''}`}
                {...(isActive ? { 'aria-current': 'page' as const } : {})}
              >
                {category.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
