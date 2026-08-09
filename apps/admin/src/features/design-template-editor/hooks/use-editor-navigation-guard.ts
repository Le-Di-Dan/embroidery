'use client';

/**
 * Unsaved-change protection for the editor.
 *
 * Two exits behave differently and both are covered. A reload or tab close can
 * only be intercepted through `beforeunload`, which shows the browser's own
 * dialog and cannot carry approved copy. Every in-app exit — the back link and
 * any shell navigation entry — goes through the shared navigation guard, so the
 * approved dialog is what the operator actually sees.
 *
 * No global router framework is introduced for this: `useRegisterNavigationInterceptor`
 * is the existing Admin seam, already used by the product form, and this hook
 * only supplies the editor's own notion of "dirty".
 *
 * It is a separate hook from the product form's rather than a shared one because
 * the two guard different things and the difference is not cosmetic: a
 * conflicted editor is dirty *and* unsaveable, so leaving is a real loss even
 * though the save button is disabled. Folding them together would have meant one
 * hook with a flag, which is the shape that later grows a second flag.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRegisterNavigationInterceptor } from '../../../shared/navigation/navigation-guard';

export interface EditorNavigationGuard {
  /** True while the confirmation dialog should be rendered. */
  readonly prompting: boolean;
  /** Routes a departure through the guard; runs it immediately when pristine. */
  readonly requestNavigation: (proceed: () => void) => void;
  readonly confirmLeave: () => void;
  readonly cancelLeave: () => void;
}

export function useEditorNavigationGuard(dirty: boolean): EditorNavigationGuard {
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
