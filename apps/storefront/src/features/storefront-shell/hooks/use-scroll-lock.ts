'use client';

import { useEffect } from 'react';

/**
 * Lock document scroll while the mobile drawer is open, restoring the previous
 * value on close or unmount. Feature-local because the storefront has no shared
 * dialog utility yet; kept tiny and side-effect-clean so no global listener or
 * style leaks. Mirrors the Admin shell hook (APP1-A02).
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}
