'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface PlacementDialogProps {
  readonly title: string;
  readonly describedBy?: string;
  readonly onClose: () => void;
  readonly wide?: boolean;
  /**
   * `alertdialog` for an interruption the operator must resolve — the version
   * conflict is the one such case here. Assistive technology announces an alert
   * dialog more insistently, which is warranted when unsaved work is at stake
   * and not warranted for the background picker.
   */
  readonly role?: 'dialog' | 'alertdialog';
  /**
   * Blocks Escape and backdrop dismissal. The conflict dialog uses it: there is
   * no safe default outcome, so dismissing it by reflex would leave the
   * operator with a draft they believe is saved.
   */
  readonly dismissible?: boolean;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The modal shell for the placement conflict dialog and background picker
 * (`596:7`; scrim per `FIG-DS-SCRIM-TOKEN`).
 *
 * Focus is moved in on open, cycled inside while open, and returned to the
 * element that opened the dialog on close — otherwise a keyboard operator who
 * dismisses the picker is dropped back at the top of the document.
 *
 * The backdrop closes on its own pointer events only. A click that starts
 * inside the panel and ends on the backdrop (a drag over a text selection) must
 * not discard the dialog.
 *
 * This duplicates `ProductDialog` in the products feature. Consolidating the
 * two means editing four accepted APP2 components and their tests, which is
 * unrelated refactoring inside a frontend checkpoint; recorded instead as
 * `FU-ADMIN-SHARED-DIALOG-01`.
 */
export function PlacementDialog({
  title,
  describedBy,
  onClose,
  wide = false,
  role = 'dialog',
  dismissible = true,
  children,
  footer,
}: PlacementDialogProps) {
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
      className="placement-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={wide ? 'placement-dialog placement-dialog--wide' : 'placement-dialog'}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
        tabIndex={-1}
      >
        <h2 className="placement-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="placement-dialog__body">{children}</div>
        <div className="placement-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
