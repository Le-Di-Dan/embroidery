'use client';

/**
 * The one bottom sheet the mobile composition has (`APP3-S11`).
 *
 * Five approved frames draw the same object — scrim, rounded panel rising from
 * the bottom edge, title, close — so there is one implementation of it and five
 * callers. Five copies of a focus trap is five chances for one of them to be
 * subtly wrong in a way only a keyboard user meets.
 *
 * A Studio-local primitive, not a dependency and not a workspace package: it is
 * used by exactly one feature, so `CLAUDE.md` §5 puts it at the narrowest scope
 * that works.
 *
 * ## What "modal" costs, and why it is paid here
 *
 * A sheet covers the stage. If focus could leave it while it covers the stage,
 * the customer would be typing into controls they cannot see. So while one is
 * open: focus enters it, `Tab` and `Shift+Tab` cycle inside it, `Escape` and the
 * scrim close it, focus returns to the control that opened it, and the page
 * behind does not scroll.
 *
 * ## Except when closing would hide something unresolved
 *
 * `dismissible` is `false` for the conflict sheet. `APP3-S10` owns that decision
 * and offers exactly two ways out of it; a scrim tap is neither, and a sheet that
 * vanished on a stray tap would leave a customer believing a conflict resolved
 * itself. Nothing about the decision changes here — this only declines to invent
 * a third way to leave it.
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';

import { STUDIO_MOBILE_COPY } from '../model/studio-mobile-copy';

export interface StudioSheetProps {
  readonly title: string;
  readonly testId: string;
  readonly onClose: () => void;
  /** `false` for a decision that may not be dismissed by tapping past it. */
  readonly dismissible?: boolean | undefined;
  /**
   * How far the on-screen keyboard has pushed the visible viewport up, in CSS
   * pixels. The sheet sits above it rather than under it (`610:409`).
   */
  readonly keyboardInsetPx?: number | undefined;
  readonly children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function StudioSheet({
  title,
  testId,
  onClose,
  dismissible = true,
  keyboardInsetPx = 0,
  children,
}: StudioSheetProps) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  /*
   * The control that opened the sheet.
   *
   * Captured on mount rather than passed in, because the opener is whatever had
   * focus and only the DOM knows that. Focus returns to it on close: a customer
   * who opened the layer sheet from the toolbar and closed it again is back on
   * the toolbar, not at the top of the document.
   */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    // The first control in the sheet, or the sheet itself. Never the document
    // body — a sheet that opens with focus behind it is a sheet a keyboard user
    // has to find.
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    // The page behind does not scroll while a sheet covers it. Restored to
    // whatever it was rather than to a hard-coded value, so two overlapping
    // owners of this property cannot fight over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      opener.current?.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const node = panel.current;
      if (node === null) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      // Containment, both directions. Without the backwards half, Shift+Tab from
      // the first control lands on the browser chrome and the customer is outside
      // a dialog they cannot see they have left.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  return (
    <div className="studio-sheet" data-testid={`${testId}-root`}>
      {/*
        A pointer shortcut for the named close button, not a second control.

        It is a `<button>` rather than a clickable `<div>` because the feature
        bans those outright and the ban is right: a div that responds to a click
        has no role, no name and no keyboard. Being a real button gives it all
        three for free — and it is then `aria-hidden` and out of the tab order,
        because a second unnamed way to close is not something to announce. The
        named `Đóng` above is the accessible path, and `Escape` is the keyboard
        one.
      */}
      <button
        aria-hidden="true"
        className="studio-sheet__scrim"
        data-testid={`${testId}-scrim`}
        onClick={dismissible ? onClose : undefined}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="studio-sheet__panel"
        data-testid={testId}
        onKeyDown={onKeyDown}
        ref={panel}
        role="dialog"
        style={keyboardInsetPx > 0 ? { bottom: `${String(keyboardInsetPx)}px` } : undefined}
        tabIndex={-1}
      >
        <header className="studio-sheet__header">
          <h2 className="studio-sheet__title" id={headingId}>
            {title}
          </h2>
          {/* No close on a sheet that may not be closed. `APP3-S10` offers a
              conflict exactly two ways out and neither of them is "later"; a
              greyed-out or silently inert Đóng would be a third one that looks
              available. */}
          {dismissible ? (
            <button
              className="studio-sheet__close"
              data-testid={`${testId}-close`}
              onClick={onClose}
              type="button"
            >
              {STUDIO_MOBILE_COPY.sheetClose}
            </button>
          ) : null}
        </header>
        <div className="studio-sheet__body">{children}</div>
      </div>
    </div>
  );
}
