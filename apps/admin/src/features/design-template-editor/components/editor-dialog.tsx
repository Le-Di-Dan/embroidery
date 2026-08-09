'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface EditorDialogProps {
  readonly title: string;
  readonly describedBy: string;
  readonly testId: string;
  readonly onDismiss: (() => void) | null;
  readonly children: ReactNode;
}

/**
 * The editor's modal shell: focus moved in on mount, focus trapped while open,
 * focus restored on close.
 *
 * `onDismiss` may be `null`, and that is a real state rather than a convenience:
 * the conflict dialog has **no** dismiss. Escaping it would leave the operator
 * with a draft they cannot save and no statement of why, so the two explicit
 * choices are the only ways out.
 *
 * This is the third hand-rolled dialog in the Admin app (`FU-ADMIN-SHARED-DIALOG-01`,
 * still unowned). It is written here rather than reaching into another feature's
 * component, which would couple two capabilities to share markup; the follow-up
 * remains the right place to resolve it once.
 */
export function EditorDialog({
  title,
  describedBy,
  testId,
  onDismiss,
  children,
}: EditorDialogProps) {
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
        onDismiss?.();
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
    <div className="template-editor-dialog__backdrop">
      <div
        ref={panelRef}
        className="template-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
      >
        <h2 className="template-editor-dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
