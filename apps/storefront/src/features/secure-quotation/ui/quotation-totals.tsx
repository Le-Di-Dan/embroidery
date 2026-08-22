import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import type { QuotationPresentation } from '../model/quotation-presentation';

/**
 * The totals block and the deposit split (`700:39`, `700:48`).
 *
 * A description list, because every row is a label and the one figure that
 * belongs to it. The total is marked up distinctly from the rows above it — it
 * is the number the acceptance names, and the approved frame sets it apart for
 * the same reason.
 *
 * The deposit note is rendered here rather than beside the buttons because it
 * is a fact about these figures, not about the controls: accepting commits a
 * price, and no money moves at this step (`700:53`).
 */
export function QuotationTotals({ presentation }: { presentation: QuotationPresentation }) {
  return (
    <section className="secure-quotation__totals" aria-label={COPY.totals.heading}>
      <dl className="secure-quotation__totals-list">
        {presentation.totals.map((row) => (
          <div className="secure-quotation__totals-row" key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        <div className="secure-quotation__totals-row secure-quotation__totals-row--total">
          <dt>{COPY.totals.total}</dt>
          <dd>{presentation.totalAmount}</dd>
        </div>
      </dl>

      <dl className="secure-quotation__deposit">
        <div className="secure-quotation__deposit-part">
          <dt>{presentation.depositLabel}</dt>
          <dd>{presentation.depositAmount}</dd>
        </div>
        <div className="secure-quotation__deposit-part">
          <dt>{presentation.remainingLabel}</dt>
          <dd>{presentation.remainingAmount}</dd>
        </div>
      </dl>

      <p className="secure-quotation__deposit-note">{COPY.totals.note}</p>
    </section>
  );
}
