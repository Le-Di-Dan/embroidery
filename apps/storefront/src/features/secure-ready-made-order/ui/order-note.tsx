import type { ReactNode } from 'react';

/**
 * The bordered note the approved frames use for every aside, caveat and warning
 * — the access-expiry band (`910:335`), the QR's truth line, the evidence
 * warning and each state's second line where the state board drew one
 * (`911:313`, `911:328`, `911:364`).
 *
 * One component rather than six copies of the same two-column row, because the
 * thing that varies between them is the tone and the sentence, and the thing
 * that must not vary is that the symbol is decorative and the text is the note.
 */
export type NoteTone = 'INFO' | 'WARNING' | 'DANGER';

const SYMBOLS: Readonly<Record<NoteTone, string>> = {
  INFO: 'ℹ',
  WARNING: '⚠',
  DANGER: '✕',
};

const MODIFIERS: Readonly<Record<NoteTone, string>> = {
  INFO: 'secure-order__note--info',
  WARNING: 'secure-order__note--warning',
  DANGER: 'secure-order__note--danger',
};

interface OrderNoteProps {
  readonly tone: NoteTone;
  readonly children: ReactNode;
  /** Set when a control points at this note through `aria-describedby`. */
  readonly id?: string;
}

export function OrderNote({ tone, children, id }: OrderNoteProps) {
  return (
    <p className={`secure-order__note ${MODIFIERS[tone]}`} {...(id === undefined ? {} : { id })}>
      <span className="secure-order__note-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      <span className="secure-order__note-text">{children}</span>
    </p>
  );
}
