'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SupportDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * `alertdialog` for the destructive confirmation, `dialog` otherwise.
   *
   * Revoke is the destructive one: it kills a customer's only way back into
   * their request, immediately and permanently. Replay is not — it re-sends
   * something that was already sent, and the worst case is a duplicate message.
   */
  readonly destructive: boolean;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The support screen's modal shell: focus moved in on mount, trapped while open,
 * restored to the trigger on close.
 *
 * Both confirmations here are dismissible. Cancelling either leaves the grant
 * and the notification exactly as they were, so `Escape` is a safe answer and
 * the operator is never trapped in a dialog they opened by mistake.
 *
 * This is the fifth hand-rolled dialog in the Admin app —
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned. It is written
 * here rather than imported from `design-template-lifecycle`, which would couple
 * two unrelated capabilities to share markup; the follow-up remains the right
 * place to resolve all five at once, and quietly reaching across a feature
 * boundary now would make that harder rather than easier.
 */
export function SupportDialog({
  title,
  describedBy,
  testId,
  destructive,
  onDismiss,
  children,
}: SupportDialogProps) {
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
    <div className="customer-access-dialog__backdrop">
      <div
        ref={panelRef}
        className="customer-access-dialog"
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="customer-access-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
