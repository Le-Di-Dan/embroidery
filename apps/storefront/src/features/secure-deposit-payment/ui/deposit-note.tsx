import type { ReactNode } from 'react';

/**
 * The bordered note the approved frames use for every aside, caveat and warning
 * (`745:359`, `747:38`, `748:26`, `748:83`, `749:17`, `749:43`).
 *
 * One component rather than six copies of the same two-column row, because the
 * thing that varies between them is the tone and the sentence, and the thing
 * that must not vary is that the symbol is decorative and the text is the note.
 *
 * The symbol is `aria-hidden` for the same reason it is on the status pill: it
 * repeats the tone the words already carry, and announcing it would put
 * "warning sign" in front of every caveat on the page.
 */
export type NoteTone = 'INFO' | 'WARNING' | 'DANGER';

const SYMBOLS: Readonly<Record<NoteTone, string>> = {
  INFO: 'ℹ',
  WARNING: '⚠',
  DANGER: '✕',
};

const MODIFIERS: Readonly<Record<NoteTone, string>> = {
  INFO: 'secure-deposit__note--info',
  WARNING: 'secure-deposit__note--warning',
  DANGER: 'secure-deposit__note--danger',
};

interface DepositNoteProps {
  readonly tone: NoteTone;
  readonly children: ReactNode;
  /** Set when a control points at this note through `aria-describedby`. */
  readonly id?: string;
}

export function DepositNote({ tone, children, id }: DepositNoteProps) {
  return (
    <p className={`secure-deposit__note ${MODIFIERS[tone]}`} {...(id === undefined ? {} : { id })}>
      <span className="secure-deposit__note-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      <span className="secure-deposit__note-text">{children}</span>
    </p>
  );
}
