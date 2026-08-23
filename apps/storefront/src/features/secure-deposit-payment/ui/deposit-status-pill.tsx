/**
 * A status badge: symbol, then label, then colour — in that order of authority
 * (`753:123`).
 *
 * The accessibility specification is explicit that *no state is distinguished by
 * colour alone*, and that the symbols are consistent across the whole APP7
 * package: `○` not started, `◷` waiting, `◐` in progress or being reconciled,
 * `✓` succeeded, `✕` invalid or finished. So the symbol and the words carry the
 * meaning and the tone only reinforces it; a viewer with no colour perception,
 * or a screen reader with none at all, reads the same fact.
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
  NEUTRAL: 'secure-deposit__pill--neutral',
  WAITING: 'secure-deposit__pill--waiting',
  PROGRESS: 'secure-deposit__pill--progress',
  SUCCESS: 'secure-deposit__pill--success',
  DANGER: 'secure-deposit__pill--danger',
};

interface DepositStatusPillProps {
  readonly tone: PillTone;
  readonly label: string;
}

export function DepositStatusPill({ tone, label }: DepositStatusPillProps) {
  return (
    <span className={`secure-deposit__pill ${MODIFIERS[tone]}`}>
      <span className="secure-deposit__pill-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      {label}
    </span>
  );
}
