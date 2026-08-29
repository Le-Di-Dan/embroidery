'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MergeDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The merge workflow's modal shell: focus moved in on mount, trapped while open,
 * restored to the trigger on close.
 *
 * Always `alertdialog`. Both decisions this shell carries are consequential and
 * neither is undoable from this product: executing moves live ownership and
 * revokes access, rejecting closes a case permanently. There is no non-
 * destructive variant here to switch on.
 *
 * Both confirmations are dismissible. Cancelling either leaves the case exactly
 * as it was — nothing is sent until confirm — so `Escape` is a safe answer and
 * the operator is never trapped in a dialog they opened by mistake. Dismissal is
 * blocked only while a request is in flight, by the caller disabling its
 * buttons, because the outcome must be read before the dialog can be believed.
 *
 * This is the sixth hand-rolled dialog in the Admin app —
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned. It is written
 * here rather than imported from `customer-access-support`, which would couple
 * two capabilities to share markup; the follow-up remains the right place to
 * resolve all of them at once, and quietly reaching across a feature boundary
 * now would make that harder rather than easier.
 */
export function MergeDialog({ title, describedBy, testId, onDismiss, children }: MergeDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => {
      const target = restoreTo.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onDismiss]);

  return (
    <div className="customer-merge-dialog__backdrop">
      <div
        ref={panelRef}
        className="customer-merge-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="customer-merge-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
