/**
 * A status badge: symbol, then label, then colour — in that order of authority.
 *
 * `917:421`/`917:424` classifies the status pill `REUSE_AS_IS` from
 * `APP9 FinalPaymentPill`, with the rule spelled out beside it — *ký hiệu +
 * nhãn + màu, không bao giờ chỉ màu*. So no state on this route is
 * distinguished by colour alone, and the symbols are the package's own: `○` not
 * started, `◷` waiting, `◐` in progress, `✓` succeeded, `✕` finished or
 * invalid. The approved state board draws exactly these glyphs — `◷` at
 * `911:310` and `911:317`, `◐` at `911:325`, `✓` at `911:332`, `911:340` and
 * `911:347`, `✕` at `911:354` and `911:361`.
 *
 * The symbol is `aria-hidden`: it is decoration for the label beside it, and a
 * screen reader announcing "circle with a line" before every status would be
 * noise, not information. The label carries the whole meaning on its own, which
 * is what makes the pill readable with no colour perception at all.
 *
 * The component is this feature's rather than an import from
 * `secure-final-payment`: that feature exports only its screen, and reaching
 * past a feature's public boundary to borrow a presentational leaf would couple
 * two payment surfaces through a private module (`CLAUDE.md` §5). The shared
 * thing here is the *rule*, and the rule is restated in the doc above.
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
  NEUTRAL: 'secure-order__pill--neutral',
  WAITING: 'secure-order__pill--waiting',
  PROGRESS: 'secure-order__pill--progress',
  SUCCESS: 'secure-order__pill--success',
  DANGER: 'secure-order__pill--danger',
};

interface OrderStatusPillProps {
  readonly tone: PillTone;
  readonly label: string;
}

export function OrderStatusPill({ tone, label }: OrderStatusPillProps) {
  return (
    <span className={`secure-order__pill ${MODIFIERS[tone]}`}>
      <span className="secure-order__pill-symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      {label}
    </span>
  );
}
