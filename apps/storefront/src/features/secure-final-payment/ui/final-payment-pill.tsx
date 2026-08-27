/**
 * A status badge: symbol, then label, then colour — in that order of authority.
 *
 * The APP9 accessibility rule is the one APP7 fixed and `APP9-D01` reuses: *no
 * state is distinguished by colour alone*, and the symbols are consistent across
 * the package — `○` not started, `◷` waiting, `◐` in progress, `✓` succeeded,
 * `✕` invalid or finished. So the symbol and the words carry the meaning and the
 * tone only reinforces it; a viewer with no colour perception, or a screen reader
 * with none at all, reads the same fact.
 *
 * The symbol is `aria-hidden`: it is decoration for the label beside it, and a
 * screen reader announcing "circle with a line" before every status would be
 * noise, not information.
 */
export type PillTone = 'NEUTRAL' | 'WAITING' | 'PROGRESS' | 'SUCCESS' | 'DANGER';

const SYMBOLS: Readonly<Record<PillTone, string>> = {
  NEUTRAL: '○',
  WAITING: '◷',
  PROGRESS: '◐',
  SUCCESS: '✓',
  DANGER: '✕',
};

const MODIFIERS: Readonly<Record<PillTone, string>> = {
  NEUTRAL: 'secure-final-payment__pill--neutral',
  WAITING: 'secure-final-payment__pill--waiting',
  PROGRESS: 'secure-final-payment__pill--progress',
  SUCCESS: 'secure-final-payment__pill--success',
  DANGER: 'secure-final-payment__pill--danger',
};

interface FinalPaymentPillProps {
  readonly tone: PillTone;
  readonly label: string;
}

export function FinalPaymentPill({ tone, label }: FinalPaymentPillProps) {
  return (
    <span className={`secure-final-payment__pill ${MODIFIERS[tone]}`}>
      <span className="secure-final-payment__pill-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      {label}
    </span>
  );
}
