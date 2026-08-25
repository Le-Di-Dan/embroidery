'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ProductionJobDialogProps {
  readonly title: string;
  readonly subtitle: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * Ignored by the caller while a transition is in flight, so a command that
   * moves stock and an order is never abandoned with nothing on screen to
   * report how it ended (`786:190`).
   */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The transition modal shell: focus moved in on mount, trapped while open,
 * restored to the trigger on close.
 *
 * `role="dialog"` rather than `alertdialog`. Opening it sends nothing and
 * changes nothing, and `Escape` before confirming is a safe answer — an operator
 * is never trapped in a window they opened by mistake. While a command is in
 * flight the caller stops honouring dismissal, because the server's answer is
 * the only thing that says whether the job moved.
 *
 * ## Why this is hand-rolled rather than imported
 *
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned: the Admin app now
 * has nine of these, one per capability that needed a modal, and none of them is
 * an accepted shared component. Borrowing `sku-stock`'s copy across a feature
 * boundary would couple production to inventory for markup, and promoting one to
 * `src/shared` for a single new caller would create the shared abstraction
 * without doing any of the work of reconciling the other eight — making the
 * follow-up harder rather than closing it. `APP8-A03` carries the debt rather
 * than half-paying it, exactly as `APP8-A01` did.
 */
export function ProductionJobDialog({
  title,
  subtitle,
  describedBy,
  testId,
  onDismiss,
  children,
}: ProductionJobDialogProps) {
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
    <div className="job-dialog__backdrop">
      <div
        ref={panelRef}
        className="job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="job-dialog__title" id={titleId}>
          {title}
        </h2>
        <p className="job-dialog__subtitle" id={describedBy}>
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}
