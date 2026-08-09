'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface LifecycleDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  /**
   * `alertdialog` for a destructive confirmation, `dialog` otherwise.
   *
   * Archive is the destructive one: it removes a Template from every customer's
   * Studio immediately. Publish and unpublish change visibility and are ordinary
   * confirmations; restore *undoes* a retirement and is not destructive either.
   */
  readonly destructive: boolean;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * The lifecycle screen's modal shell: focus moved in on mount, trapped while
 * open, restored to the trigger on close.
 *
 * Every confirmation here is dismissible, unlike the editor's conflict dialog —
 * cancelling a publish or an archive always leaves the Template exactly as it
 * was, so `Escape` is a safe answer and the operator is never trapped.
 *
 * This is the fourth hand-rolled dialog in the Admin app
 * (`FU-ADMIN-SHARED-DIALOG-01`, still unowned). It is written here rather than
 * imported from another feature's components, which would couple two
 * capabilities to share markup; the follow-up remains the right place to resolve
 * it once, for all four at the same time.
 */
export function LifecycleDialog({
  title,
  describedBy,
  testId,
  destructive,
  onDismiss,
  children,
}: LifecycleDialogProps) {
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
    <div className="template-lifecycle-dialog__backdrop">
      <div
        ref={panelRef}
        className="template-lifecycle-dialog"
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="template-lifecycle-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
