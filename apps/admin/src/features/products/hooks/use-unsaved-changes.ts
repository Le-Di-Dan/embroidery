'use client';

/**
 * Unsaved-change protection for the product form.
 *
 * Two exits have to be covered and they behave differently. A browser reload or
 * tab close can only be intercepted through `beforeunload`, which shows the
 * browser's own dialog and cannot carry approved copy. Every in-app exit — the
 * cancel action and internal navigation — is intercepted here so the approved
 * dialog is what the operator actually sees.
 *
 * No global router framework is introduced for this. The screen routes its own
 * departures through `requestNavigation`, which is the smallest thing that can
 * hold the intent while the dialog is open. A pristine form never intercepts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UnsavedChangesGuard {
  /** True while the confirmation dialog should be rendered. */
  readonly prompting: boolean;
  /** Routes a departure through the guard; runs it immediately when pristine. */
  readonly requestNavigation: (proceed: () => void) => void;
  /** The operator chose to leave; the pending departure runs. */
  readonly confirmLeave: () => void;
  /** The operator chose to stay; the pending departure is discarded. */
  readonly cancelLeave: () => void;
}

export function useUnsavedChanges(dirty: boolean): UnsavedChangesGuard {
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

  return { prompting, requestNavigation, confirmLeave, cancelLeave };
}
