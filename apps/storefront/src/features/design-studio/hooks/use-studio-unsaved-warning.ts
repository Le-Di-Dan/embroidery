'use client';

/**
 * The navigation warning, while and only while work is genuinely unsaved
 * (`APP3-S10`).
 *
 * The approved offline copy tells the customer their changes are on screen but
 * not on the server and asks them not to close the tab. That sentence is true
 * because nothing here durably stores a document — so the browser's own
 * confirmation is the last thing standing between a closed tab and lost work.
 *
 * ## What it deliberately does not do
 *
 * It does not save. `beforeunload` is not a place to start a request: the tab is
 * being torn down, an in-flight PUT would be cancelled mid-write, and a
 * `sendBeacon` would fire a save nobody could reconcile the outcome of — the
 * exact unknown outcome the loop above exists to never create blindly.
 *
 * ## The narrowest form the platform allows
 *
 * `preventDefault()` and nothing else. Browsers ignore any custom message and
 * show their own, so supplying one would be writing copy no customer will read.
 * The listener is added only while there is something to lose and removed the
 * moment there is not — a permanently installed handler would interrupt a
 * customer leaving a fully saved design.
 */
import { useEffect } from 'react';

export function useStudioUnsavedWarning(unsaved: boolean): void {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved]);
}
