import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import type { QuotationLineView } from '../model/quotation-presentation';

/**
 * The frozen line items of one version (`700:14` … `700:38`, `704:13` … `704:28`).
 *
 * A real `table`, because it is one: four columns of the same kind of fact
 * repeated per row, which is what makes a screen reader's row-and-column
 * navigation useful. The mobile frame stacks each line into a block — that is
 * CSS on the same markup, not a second component, so the two viewports can
 * never drift into showing different figures.
 *
 * Every amount arrives already formatted by `exact-money.ts`. Nothing in this
 * component multiplies quantity by unit price to check the line total: the
 * total is the server's frozen figure, and a client that recomputed it would
 * eventually disagree with the offer the customer is being asked to accept.
 */
export function QuotationLines({ lines }: { lines: QuotationLineView[] }) {
  if (lines.length === 0) {
    return <p className="secure-quotation__empty">{COPY.lines.empty}</p>;
  }

  return (
    <table className="secure-quotation__lines">
      <caption className="secure-quotation__visually-hidden">{COPY.lines.heading}</caption>
      <thead>
        <tr>
          <th scope="col">{COPY.lines.description}</th>
          <th scope="col" className="secure-quotation__numeric">
            {COPY.lines.quantity}
          </th>
          <th scope="col" className="secure-quotation__numeric">
            {COPY.lines.unitPrice}
          </th>
          <th scope="col" className="secure-quotation__numeric">
            {COPY.lines.lineTotal}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.key} className="secure-quotation__line">
            <th scope="row" className="secure-quotation__line-description">
              <span className="secure-quotation__line-text">{line.description}</span>
              <span className="secure-quotation__line-kind">{line.kind}</span>
            </th>
            <td className="secure-quotation__numeric" data-label={COPY.lines.quantity}>
              {line.quantity}
            </td>
            <td className="secure-quotation__numeric" data-label={COPY.lines.unitPrice}>
              {line.unitPrice}
            </td>
            <td className="secure-quotation__numeric" data-label={COPY.lines.lineTotal}>
              {line.lineTotal}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
