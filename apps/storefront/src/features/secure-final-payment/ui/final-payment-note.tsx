import type { ReactNode } from 'react';

/**
 * The bordered note the approved frames use for every aside, caveat and warning
 * (`816:221` QR truth, `817:29` evidence, `818:21` not-payable, `818:84` and
 * `818:184` the two exclusion blocks).
 *
 * One component rather than five copies of the same two-column row, because the
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
  INFO: 'secure-final-payment__note--info',
  WARNING: 'secure-final-payment__note--warning',
  DANGER: 'secure-final-payment__note--danger',
};

interface FinalPaymentNoteProps {
  readonly tone: NoteTone;
  readonly children: ReactNode;
  /** Set when a control points at this note through `aria-describedby`. */
  readonly id?: string;
}

export function FinalPaymentNote({ tone, children, id }: FinalPaymentNoteProps) {
  return (
    <p
      className={`secure-final-payment__note ${MODIFIERS[tone]}`}
      {...(id === undefined ? {} : { id })}
    >
      <span className="secure-final-payment__note-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      <span className="secure-final-payment__note-text">{children}</span>
    </p>
  );
}
