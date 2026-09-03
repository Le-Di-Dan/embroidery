'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The Storefront's one modal frame (`APP12-H01`, closing `FU-APP12-S03-03`).
 *
 * Five secure screens — the quotation (`APP6-S01`), the design review
 * (`APP6-S01`), the deposit (`APP7-S01`), the remaining balance (`APP9-S01`) and
 * the Ready-Made order (`APP12-S03`) — each carried its own copy of this
 * component. The copies were byte-identical in behaviour and differed only in
 * the BEM prefix on three class names, and each said so in its own header while
 * declining to promote it: at the time, a cross-feature import would have
 * coupled the screens through a presentation module and the promoting
 * checkpoint was not authorised to edit APP7/APP9 source.
 *
 * ## What was promoted, and what deliberately was not
 *
 * Only the frame's *generic* behaviour lives here — the accessibility and focus
 * contract every modal must satisfy and none of them should re-derive:
 *
 * ```text
 * role="dialog" + aria-modal + aria-labelledby from its own heading
 * initial focus on the heading
 * Escape dismisses
 * Tab and Shift+Tab cycle inside the dialog
 * focus returns to the control that opened it
 * the scrim is not a dismiss target
 * ```
 *
 * Everything domain-shaped stayed in the feature that owns it: the copy, the
 * verification challenge, the mutation, the outcomes and the styling. This
 * component renders no text of its own and decides nothing about what the dialog
 * is for. It takes its class names as props, so each screen keeps the exact BEM
 * block its own approved stylesheet is written against and no shared stylesheet
 * had to be invented to hold a fifth one.
 *
 * ## Two behaviours worth keeping deliberate
 *
 * **The focus trap cycles rather than making the page inert.** `inert` is not
 * available in every browser this Storefront supports, and a trap that works
 * everywhere is worth more than one that is tidier where it works.
 *
 * **The scrim does not dismiss.** These dialogs stand between the customer and
 * a credential or an irreversible decision, and a stray click on the backdrop is
 * the least deliberate gesture there is. Escape and the explicit cancel control
 * are the two ways out, and both are the customer saying so.
 *
 * **Focus lands on the heading, not the first control.** The customer must read
 * what is being asked of them before their fingers are on the field that
 * answers it.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalFrameProps {
  /** The accessible name. Rendered as the dialog's own heading. */
  readonly title: string;
  /** Escape, and whatever explicit control the feature renders in `children`. */
  readonly onDismiss: () => void;
  /** The feature's BEM block, so its approved stylesheet still applies. */
  readonly scrimClassName: string;
  readonly dialogClassName: string;
  readonly titleClassName: string;
  readonly children: ReactNode;
}

export function ModalFrame({
  title,
  onDismiss,
  scrimClassName,
  dialogClassName,
  titleClassName,
  children,
}: ModalFrameProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  /** The control that had focus when the dialog opened, to give it back. */
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialog.querySelector<HTMLElement>('[data-dialog-heading]')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, []);

  return (
    <div className={scrimClassName}>
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <h2 className={titleClassName} id={titleId} tabIndex={-1} data-dialog-heading>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
