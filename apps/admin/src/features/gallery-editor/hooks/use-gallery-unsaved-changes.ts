'use client';

/**
 * Unsaved-change protection for the gallery editor.
 *
 * Two exits have to be covered and they behave differently. A browser reload or
 * tab close can only be intercepted through `beforeunload`, which shows the
 * browser's own dialog and cannot carry approved copy. Every in-app exit — the
 * back link, the list navigation, a shell entry — is intercepted here so the
 * approved dialog is what the operator actually sees.
 *
 * No router framework is introduced for this. The screen routes its own
 * departures through `requestNavigation`, and departures it does not own — a
 * shell navigation entry, which lives outside this subtree — reach the same
 * function through the shared navigation guard. One dialog, one decision,
 * regardless of which control was used.
 *
 * ## Two kinds of dirt, one guard
 *
 * The editor holds authoring edits and media arrangement independently: an
 * operator can reorder images without touching a field, and vice versa. Both
 * are unsaved work, so the guard takes their disjunction — protecting one and
 * not the other would silently discard exactly the half that was not checked.
 *
 * A pristine editor never intercepts, and nothing is dirty immediately after
 * hydration: both dirty flags are computed by diffing against the record the
 * screen was seeded from, so seeding cannot itself register a change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRegisterNavigationInterceptor } from '../../../shared/navigation/navigation-guard';

export interface GalleryUnsavedChangesGuard {
  /** True while the confirmation dialog should be rendered. */
  readonly prompting: boolean;
  /** Routes a departure through the guard; runs it immediately when pristine. */
  readonly requestNavigation: (proceed: () => void) => void;
  /** The operator chose to leave; the pending departure runs. */
  readonly confirmLeave: () => void;
  /** The operator chose to stay; the pending departure is discarded. */
  readonly cancelLeave: () => void;
}

export function useGalleryUnsavedChanges(dirty: boolean): GalleryUnsavedChangesGuard {
  const [prompting, setPrompting] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // The spec requires both to cover current and legacy browsers; neither
      // lets us supply copy, which is why in-app exits are handled separately.
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const requestNavigation = useCallback(
    (proceed: () => void) => {
      if (!dirty) {
        proceed();
        return;
      }
      pending.current = proceed;
      setPrompting(true);
    },
    [dirty],
  );

  const confirmLeave = useCallback(() => {
    const proceed = pending.current;
    pending.current = null;
    setPrompting(false);
    proceed?.();
  }, []);

  const cancelLeave = useCallback(() => {
    pending.current = null;
    setPrompting(false);
  }, []);

  useRegisterNavigationInterceptor(requestNavigation);

  return { prompting, requestNavigation, confirmLeave, cancelLeave };
}
