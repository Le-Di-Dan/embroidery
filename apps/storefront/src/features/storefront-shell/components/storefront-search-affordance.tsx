import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

/**
 * Presentational search affordance. The approved header composes a search bar,
 * but the storefront has no canonical search route or backend in APP1-S01A, so
 * this is deliberately **non-functional and non-focusable**: it is not an
 * `<input>`, submits nowhere, and calls no API (APP1-S01A §10). It preserves the
 * approved visual while an accessible, screen-reader-only note announces that the
 * capability is not available yet — never a focusable control that looks
 * functional but does nothing. The owning search phase replaces this with a real
 * control wired to the canonical route.
 */
export function StorefrontSearchAffordance() {
  const { search } = STOREFRONT_SHELL_COPY;
  return (
    <div className="storefront-shell__search" aria-hidden="true">
      <span className="storefront-shell__search-glyph">⌕</span>
      <span className="storefront-shell__search-hint">{search.hint}</span>
    </div>
  );
}

/**
 * The accessible counterpart of the presentational affordance: announces the
 * unavailable search capability to assistive technology without exposing a fake
 * control. Rendered alongside the visual affordance in the header.
 */
export function StorefrontSearchStatus() {
  return (
    <p className="storefront-shell__sr-only" role="note">
      {STOREFRONT_SHELL_COPY.search.unavailable}
    </p>
  );
}
