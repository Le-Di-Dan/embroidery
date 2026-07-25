'use client';

import { useEffect } from 'react';

/**
 * Lock document scroll while an overlay (mobile drawer / session-expired modal)
 * is active, restoring the previous value on deactivation or unmount. Feature-
 * local because the repository has no shared dialog utility yet; kept tiny and
 * side-effect-clean so no global listener or style leaks.
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
