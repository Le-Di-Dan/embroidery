'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SellabilityDialogProps {
  readonly title: string;
  /** The subject line beneath the heading — the dialog's accessible description. */
  readonly subtitle: string;
  readonly testId: string;
  /** Ignored by the caller while a write is in flight. */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The modal shell for variant and SKU authoring (`975:187`, `976:187`).
 *
 * Focus moves in on mount, is trapped while open, and returns to the trigger on
 * close. The trap collects its focusable elements on **each** Tab rather than
 * once on mount, because these dialogs change shape while open: a refusal adds
 * an alert, switching the price mode reveals an input, and a cycle computed
 * from the initial markup would walk out of the dialog through an element that
 * no longer exists.
 *
 * The panel itself is the initial focus target rather than its first control
 * (`APP12-H08`): a dialog that lands the caret in a text field announces the
 * field and not the dialog, and the operator never hears what they opened. The
 * panel is `tabIndex={-1}` and is therefore excluded from the Tab cycle it
 * receives focus outside of — which is exactly the trap escape `H08` found and
 * why the cycle is recomputed rather than seeded from the focused element.
 *
 * `role="dialog"`, not `alertdialog`. Opening one sends nothing and changes
 * nothing, and `Escape` before submitting is a safe answer.
 *
 * ## Why this is hand-rolled rather than imported
 *
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned. Borrowing the
 * inventory feature's copy would couple sellability authoring to the stock
 * workspace for markup, and promoting one of the existing implementations to
 * `src/shared` for a single new caller would create the shared abstraction
 * without reconciling the others — making the follow-up harder rather than
 * closing it. This checkpoint carries the debt rather than half-paying it.
 */
export function SellabilityDialog({
  title,
  subtitle,
  testId,
  onDismiss,
  children,
}: SellabilityDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement;
    panelRef.current?.focus();
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
      // The panel holds focus on mount and is not in the cycle. Tab from it must
      // enter the cycle deliberately rather than fall through to the page.
      if (document.activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
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
    <div className="product-sellability-dialog__backdrop">
      <div
        ref={panelRef}
        className="product-sellability-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="product-sellability-dialog__title" id={titleId}>
          {title}
        </h2>
        <p className="product-sellability-dialog__subtitle" id={subtitleId}>
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}
