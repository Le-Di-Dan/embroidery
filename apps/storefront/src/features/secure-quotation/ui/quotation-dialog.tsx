'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The scrim-and-dialog frame the three `APP6-S01` overlays share (`701:62`,
 * `701:63`).
 *
 * One frame rather than three, because everything a modal must get right —
 * `role="dialog"`, `aria-modal`, an accessible name taken from its own heading,
 * initial focus, Escape, and focus that cannot wander into the page behind the
 * scrim — is the same for confirming an acceptance, confirming a rejection and
 * re-verifying. Three copies would be three chances to get one of them wrong.
 *
 * Focus is trapped by cycling Tab within the dialog's own focusable elements
 * rather than by making the rest of the document inert: `inert` is not
 * available in every browser this Storefront supports, and a trap that works
 * everywhere is worth more than one that is tidier where it works.
 *
 * The scrim itself is not a dismiss target. Every one of these dialogs stands
 * between the customer and a commitment or a credential, and a stray click on
 * the backdrop is the least deliberate gesture there is. Escape and the
 * explicit cancel control are the two ways out, and both are the customer
 * saying so.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface QuotationDialogProps {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

export function QuotationDialog({ title, onDismiss, children }: QuotationDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;

    // The heading, not the first control: the customer must read what they are
    // about to commit to before their fingers are on the button that does it.
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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="secure-quotation__scrim">
      <div
        className="secure-quotation__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <h2
          className="secure-quotation__dialog-title"
          id={titleId}
          tabIndex={-1}
          data-dialog-heading
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
