'use client';

import { useCallback, useRef, useState } from 'react';

import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontMobileDrawer, STOREFRONT_MOBILE_DRAWER_ID } from './storefront-mobile-drawer';

/**
 * The shell's only client island (APP1-S01A §7): the mobile navigation trigger
 * plus the drawer it controls. Keeping the interactive surface here lets the
 * header, footer, and shell stay Server Components. The trigger is a real button
 * that reports its expanded state and owns the drawer via `aria-controls`; on
 * desktop/tablet it is hidden by CSS and the inline header nav is used instead.
 *
 * Focus return is owned here, not left to the trap's unmount cleanup: closing the
 * drawer refocuses the trigger synchronously (before the drawer unmounts), which
 * is deterministic across browsers where an unmount-time refocus can otherwise
 * fall through to `<body>`.
 */
export function StorefrontMobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="storefront-shell__nav-trigger"
        aria-label={STOREFRONT_SHELL_COPY.nav.openMenu}
        aria-expanded={open}
        aria-controls={STOREFRONT_MOBILE_DRAWER_ID}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className="storefront-shell__nav-trigger-glyph">
          ☰
        </span>
      </button>
      <StorefrontMobileDrawer open={open} onClose={close} />
    </>
  );
}
