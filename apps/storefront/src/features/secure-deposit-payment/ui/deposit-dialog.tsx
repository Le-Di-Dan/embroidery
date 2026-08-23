'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The scrim-and-dialog frame the step-up overlay uses (`747:41`, composing
 * `APP6-D01`'s `701:3`).
 *
 * Everything a modal must get right — `role="dialog"`, `aria-modal`, an
 * accessible name taken from its own heading, initial focus, Escape, and focus
 * that cannot wander into the page behind the scrim — is arranged here so the
 * one overlay on this route inherits it rather than re-deriving it.
 *
 * Focus is trapped by cycling Tab within the dialog's own focusable elements
 * rather than by making the rest of the document inert: `inert` is not available
 * in every browser this Storefront supports, and a trap that works everywhere is
 * worth more than one that is tidier where it works. `753:172` requires the trap,
 * Escape, and focus returning to the control that opened it.
 *
 * The scrim is not a dismiss target. This dialog stands between the customer and
 * a credential, and a stray click on the backdrop is the least deliberate gesture
 * there is. Escape and the explicit cancel control are the two ways out, and both
 * are the customer saying so.
 *
 * ### Why the frame is this feature's and not an import from `APP6-S01`
 *
 * The quotation dialog is styled by, and named for, the quotation feature; a
 * cross-feature import would couple two screens through a presentation module,
 * which `CLAUDE.md` §5 places at the wrong scope. The *behaviour* below is the
 * shared thing, and it is short enough to state twice; a third consumer is the
 * moment it belongs in `shared/`.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DepositDialogProps {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

export function DepositDialog({ title, onDismiss, children }: DepositDialogProps) {
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

    // The heading, not the first control: the customer must read what is being
    // asked of them before their fingers are on the field that answers it.
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
    <div className="secure-deposit__scrim">
      <div
        className="secure-deposit__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <h2 className="secure-deposit__dialog-title" id={titleId} tabIndex={-1} data-dialog-heading>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
