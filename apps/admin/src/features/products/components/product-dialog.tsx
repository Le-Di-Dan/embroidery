'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ProductDialogProps {
  readonly title: string;
  readonly describedBy?: string;
  readonly onClose: () => void;
  /** Wider layout for the media picker; the confirmations stay compact. */
  readonly wide?: boolean;
  /**
   * `alertdialog` for a confirmation that interrupts to prevent a consequential
   * change — the unpublish confirmation is the one such case in this feature.
   * Assistive technology announces an alert dialog more insistently, which is
   * warranted when the operator is about to remove a product from public view
   * and not warranted for the media picker.
   */
  readonly role?: 'dialog' | 'alertdialog';
  /**
   * Blocks Escape and backdrop dismissal while a command is in flight. The
   * dialog owns the only cancel affordance for a request that has already left
   * the browser, so letting it vanish mid-flight would leave the operator with
   * no indication of what happened to it.
   */
  readonly dismissible?: boolean;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The modal shell shared by the picker, the conflict dialog and the
 * unsaved-change dialog (`437:73` — role=dialog, aria-modal=true, focus
 * trapped).
 *
 * Focus is moved in on open, cycled inside while open, and returned to the
 * element that opened the dialog on close — otherwise a keyboard operator who
 * dismisses the picker is dropped back at the top of the document. Escape and
 * the backdrop both close, matching the approved dialog behaviour.
 *
 * The backdrop closes on its own pointer events only. A click that starts
 * inside the panel and ends on the backdrop (a drag over a text selection) must
 * not discard the dialog.
 */
export function ProductDialog({
  title,
  describedBy,
  onClose,
  wide = false,
  role = 'dialog',
  dismissible = true,
  children,
  footer,
}: ProductDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      const target = restoreTo.current;
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (dismissible) {
          onClose();
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
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        return;
      }
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
  }, [onClose, dismissible]);

  return (
    <div
      className="product-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={wide ? 'product-dialog product-dialog--wide' : 'product-dialog'}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
        tabIndex={-1}
      >
        <h2 className="product-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="product-dialog__body">{children}</div>
        <div className="product-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
