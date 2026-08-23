'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PaymentDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * Ignored while a decision is in flight or being reconciled, so a half-written
   * financial mutation is never abandoned with nothing on screen to report it.
   */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The payment modal shell: focus moved in on mount, trapped while open, restored
 * to the trigger on close (`753:172`).
 *
 * Every dialog here is dismissible. Closing one before submitting sends nothing
 * and changes nothing — the attempt stays exactly as it was — so `Escape` is a
 * safe answer and the operator is never trapped in a dialog they opened by
 * mistake. The caller is responsible for ignoring a dismiss while a decision is
 * in flight; a lost dialog over a running verification would leave the operator
 * with no way to see how it ended.
 *
 * `role="dialog"` rather than `alertdialog`. Neither decision is destructive in
 * the way a rejection is: a verification either records the truth or routes the
 * attempt to reconciliation, and a review is reversible by verifying afterwards.
 *
 * This is the seventh hand-rolled dialog in the Admin app —
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned. It is written
 * here rather than imported from `custom-request-detail`, which would couple two
 * unrelated capabilities to share markup; the follow-up remains the right place
 * to resolve all seven at once, and quietly reaching across a feature boundary
 * now would make that harder rather than easier.
 */
export function PaymentDialog({
  title,
  describedBy,
  testId,
  onDismiss,
  children,
}: PaymentDialogProps) {
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
    <div className="payment-dialog__backdrop">
      <div
        ref={panelRef}
        className="payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="payment-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
