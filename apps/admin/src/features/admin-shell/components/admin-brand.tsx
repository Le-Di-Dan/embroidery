import { BrandSymbol } from '@embroidery/ui';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

/** The app-bar slot's usable symbol height, measured from its own type stack. */
const ADMIN_SHELL_SYMBOL_PX = 28;

/**
 * Shell brand mark: the approved symbol beside the eyebrow + wordmark stack.
 * Presentational; reused in the desktop app bar and the mobile drawer header.
 *
 * The **micro** variant, deliberately. The two-line stack beside it is a caption
 * over a body-l title — about 36px of usable height — and `BRD0-F02` proves the
 * production symbol's seal ring only from 48px on a light ground. Using the ring
 * here would mean shrinking it below what the design showed is readable, so the
 * ringless variant is the correct one rather than the smaller-looking one.
 *
 * Decorative: the brand name is visible text beside it.
 */
export function AdminBrand() {
  const { eyebrow, title } = ADMIN_SHELL_COPY.brand;
  return (
    <span className="admin-shell__brand">
      <BrandSymbol variant="micro" size={ADMIN_SHELL_SYMBOL_PX} tone="ink" />
      <span className="admin-shell__brand-text">
        <span className="admin-shell__brand-eyebrow">{eyebrow}</span>
        <span className="admin-shell__brand-title">{title}</span>
      </span>
    </span>
  );
}
