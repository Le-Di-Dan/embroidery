'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StockDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * Ignored while the adjustment is in flight, so a half-written stock movement
   * is never abandoned with nothing on screen to report how it ended.
   */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The inventory modal shell: focus moved in on mount, trapped while open,
 * restored to the trigger on close.
 *
 * `role="dialog"` rather than `alertdialog`. Opening it sends nothing and
 * changes nothing, and `Escape` before submitting is a safe answer — the
 * operator is never trapped in a dialog they opened by mistake. While an
 * adjustment is in flight the caller stops honouring dismissal: `777:77` is
 * explicit that the operator must not close the window mid-write, because the
 * server's answer is the only thing that says whether stock moved.
 *
 * ## Why this is hand-rolled rather than imported
 *
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned: the Admin app
 * now has eight of these, one per capability that needed a modal, and none of
 * them is an accepted shared component. Reaching across a feature boundary to
 * borrow `order-detail`'s copy would couple inventory to the payment workspace
 * for markup, and promoting one to `src/shared` for a single caller would
 * create the shared abstraction without doing any of the work of reconciling
 * the other seven — making the follow-up harder rather than closing it. APP8-A01
 * therefore carries the debt rather than half-paying it, and the follow-up
 * remains the right place to resolve all of them at once.
 */
export function StockDialog({ title, describedBy, testId, onDismiss, children }: StockDialogProps) {
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
    <div className="stock-dialog__backdrop">
      <div
        ref={panelRef}
        className="stock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="stock-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
