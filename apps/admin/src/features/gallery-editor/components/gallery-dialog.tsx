'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The modal shell shared by the create bootstrap, both asset pickers, the
 * product picker, the unpublish confirmation, the conflict dialog and the
 * unsaved-change dialog (`870:926`, `870:1274` — role=dialog, aria-modal=true,
 * focus trapped).
 *
 * Focus is moved in on open, cycled inside while open, and returned to the
 * element that opened the dialog on close — otherwise a keyboard operator who
 * dismisses the picker is dropped back at the top of the document. Escape and
 * the backdrop both close, matching the approved dialog behaviour.
 *
 * The backdrop closes on its own pointer events only. A click that starts
 * inside the panel and ends on the backdrop — a drag over a text selection —
 * must not discard the dialog and the work in it.
 *
 * ## Why this is a third implementation, and what should happen to it
 *
 * `APP2-A03` and `APP3-A03` each own an equivalent shell. Promoting one of them
 * to Admin shared scope would mean rewriting two delivered, accepted features,
 * which is not this checkpoint's change — so the duplication is disclosed as
 * `FU-APP11-A02-01` rather than resolved by an unrelated refactor. The
 * behaviour here is deliberately the same behaviour, so that extraction stays a
 * mechanical move when it is scheduled.
 */
export interface GalleryDialogProps {
  readonly title: string;
  readonly describedBy?: string;
  readonly onClose: () => void;
  /** Wider layout for the pickers; the confirmations stay compact. */
  readonly wide?: boolean;
  /**
   * `alertdialog` for a confirmation that interrupts to prevent a consequential
   * change — the unpublish confirmation and the conflict notice are the two
   * such cases here. Assistive technology announces an alert dialog more
   * insistently, which is warranted when the operator is about to remove an
   * entry from public view and is not warranted for a picker.
   */
  readonly role?: 'dialog' | 'alertdialog';
  /**
   * Blocks Escape and backdrop dismissal while a command is in flight. The
   * dialog owns the only affordance for a request that has already left the
   * browser, so letting it vanish mid-flight would leave the operator with no
   * indication of what happened to it.
   */
  readonly dismissible?: boolean;
  readonly testId?: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GalleryDialog({
  title,
  describedBy,
  onClose,
  wide = false,
  role = 'dialog',
  dismissible = true,
  testId,
  children,
  footer,
}: GalleryDialogProps) {
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
      className="gallery-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={wide ? 'gallery-dialog gallery-dialog--wide' : 'gallery-dialog'}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        tabIndex={-1}
      >
        <h2 className="gallery-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="gallery-dialog__body">{children}</div>
        <div className="gallery-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
