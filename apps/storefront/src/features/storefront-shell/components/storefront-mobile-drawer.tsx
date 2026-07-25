'use client';

import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { useScrollLock } from '../hooks/use-scroll-lock';
import { StorefrontBrand } from './storefront-brand';
import { StorefrontPrimaryNav } from './storefront-primary-nav';

/** DOM id of the drawer; the trigger points at it via `aria-controls`. */
export const STOREFRONT_MOBILE_DRAWER_ID = 'storefront-mobile-drawer';

interface StorefrontMobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Mobile navigation drawer (FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN). A semantic modal
 * dialog: focus enters on open and is trapped, Escape and the backdrop close it,
 * an explicit close button is provided, and focus returns to the trigger on close
 * (all via `useFocusTrap`). Background scroll is locked while open. It is
 * unmounted when closed, so no background listener or focusable leaks. The scrim
 * is a local `ink/900 @45%` composition (GAP-D02 / FIG-DS-SCRIM-TOKEN — no scrim
 * token exists yet).
 */
export function StorefrontMobileDrawer({ open, onClose }: StorefrontMobileDrawerProps) {
  const dialogRef = useFocusTrap(open, onClose);
  useScrollLock(open);

  if (!open) {
    return null;
  }

  return (
    <div className="storefront-shell__drawer-root">
      <div className="storefront-shell__scrim" onClick={onClose} aria-hidden="true" />
      <div
        id={STOREFRONT_MOBILE_DRAWER_ID}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={STOREFRONT_SHELL_COPY.nav.drawerLabel}
        className="storefront-shell__drawer"
      >
        <div className="storefront-shell__drawer-head">
          <StorefrontBrand />
          <button
            type="button"
            className="storefront-shell__drawer-close"
            aria-label={STOREFRONT_SHELL_COPY.nav.closeMenu}
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <StorefrontPrimaryNav variant="drawer" />
      </div>
    </div>
  );
}
