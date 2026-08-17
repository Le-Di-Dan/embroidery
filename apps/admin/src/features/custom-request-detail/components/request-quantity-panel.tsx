import type { AdminRequestQuantityLineResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';

interface RequestQuantityPanelProps {
  readonly lines: readonly AdminRequestQuantityLineResponse[];
  readonly totalQuantity: number;
}

/**
 * What the customer asked for, exactly as stored (`665:3`, `665:115`).
 *
 * Read-only and unaggregated. The lines are rendered one for one: nothing is
 * merged because two lines share a size label, nothing is split, and no variant
 * is inferred for a line that carries none — `productVariantId` is always absent
 * on a customer-owned line, which has no catalog variant at all.
 *
 * `totalQuantity` is the server's own sum and is printed as received rather than
 * recomputed here. A screen that added the lines up itself would silently
 * disagree with the queue the moment the two calculations drifted.
 */
export function RequestQuantityPanel({ lines, totalQuantity }: RequestQuantityPanelProps) {
  return (
    <section className="request-detail__panel" aria-labelledby="request-quantity-heading">
      <h2 className="request-detail__panel-title" id="request-quantity-heading">
        {COPY.sections.quantity}
      </h2>

      <p className="request-detail__total" data-testid="request-quantity-total">
        <span className="request-detail__term">{COPY.quantity.total}</span>
        <span className="request-detail__total-value">{totalQuantity}</span>
      </p>

      {lines.length === 0 ? (
        <p className="request-detail__hint" data-testid="request-quantity-empty">
          {COPY.quantity.empty}
        </p>
      ) : (
        <table className="request-detail__table" data-testid="request-quantity-lines">
          <caption className="request-detail__table-caption">{COPY.quantity.lines}</caption>
          <thead>
            <tr>
              <th scope="col">{COPY.quantity.sizeLabel}</th>
              <th scope="col">{COPY.quantity.units}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.sizeLabel ?? 'no-size'}-${String(index)}`}>
                <td>{line.sizeLabel ?? COPY.quantity.noSize}</td>
                <td>{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="request-detail__hint">{COPY.quantity.readOnly}</p>
    </section>
  );
}
