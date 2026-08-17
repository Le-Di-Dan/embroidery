'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModerationDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * `alertdialog` for the two terminal decisions, `dialog` otherwise.
   *
   * Rejection and cancellation end the request: `APP5` offers no move out of
   * either state, so there is no undo and the assistive-technology announcement
   * should carry that weight. Asking for clarification does not — the request
   * comes back into review.
   */
  readonly destructive: boolean;
  /** Ignored while a command is in flight, so a half-written write is never abandoned. */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The moderation modal shell: focus moved in on mount, trapped while open,
 * restored to the trigger on close (`669:3`, `669:60`, `669:119`).
 *
 * Every moderation dialog is dismissible. Closing one sends nothing and changes
 * nothing — the request stays exactly as it was — so `Escape` is always a safe
 * answer and the operator is never trapped in a dialog they opened by mistake.
 * The caller is responsible for ignoring a dismiss while a command is in flight.
 *
 * This is the sixth hand-rolled dialog in the Admin app —
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned. It is written
 * here rather than imported from `customer-access-support` or
 * `design-template-lifecycle`, which would couple unrelated capabilities to
 * share markup; the follow-up remains the right place to resolve all six at
 * once, and quietly reaching across a feature boundary now would make that
 * harder rather than easier.
 */
export function ModerationDialog({
  title,
  describedBy,
  testId,
  destructive,
  onDismiss,
  children,
}: ModerationDialogProps) {
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
    <div className="moderation-dialog__backdrop">
      <div
        ref={panelRef}
        className="moderation-dialog"
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="moderation-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
