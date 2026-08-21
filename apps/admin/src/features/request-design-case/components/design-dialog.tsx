'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DesignDialogProps {
  readonly title: string;
  readonly titleId?: string;
  /** Blocks dismissal while a write is in flight. */
  readonly busy: boolean;
  readonly onDismiss: () => void;
  readonly testId: string;
  readonly children: ReactNode;
}

/**
 * The modal shell both design-case dialogs share.
 *
 * ### Why this is feature-local rather than an Admin-wide component
 *
 * `FU-ADMIN-SHARED-DIALOG-01` is still open and still unowned, and `APP6-A02`
 * §32 says explicitly not to open a shared-dialog refactor just because this
 * screen uses dialogs. Reaching into `APP6-A01` for its markup would couple two
 * unrelated capabilities and make that follow-up harder, not easier — so this
 * feature carries its own, and the follow-up carries forward unchanged.
 *
 * What it does do is stop A02 growing a *second* copy: the create dialog and the
 * send dialog share this shell rather than each hand-rolling focus handling.
 *
 * ### Dismissal is blocked while a write is in flight
 *
 * Escape stops working once the request is out: the write is already happening,
 * and closing the dialog would leave the operator without the outcome. Confirm
 * buttons are `disabled` *and* guarded by a ref in their hook, because
 * `disabled` is one render behind a double-click.
 */
export function DesignDialog({
  title,
  titleId,
  busy,
  onDismiss,
  testId,
  children,
}: DesignDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const generatedId = useId();
  const headingId = titleId ?? generatedId;

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => {
      const target = restoreTo.current;
      if (target instanceof HTMLElement) {
        target.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!busy) {
        onDismiss();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="request-design-case__backdrop" data-testid={testId}>
      <div
        className="request-design-case__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <h2 className="request-design-case__dialog-title" id={headingId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
