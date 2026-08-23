import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { LongTextValue } from './long-text-value';

interface ExpectedObservedTableProps {
  readonly expectedAmount: string;
  readonly expectedReference: string;
  readonly observedAmount: string;
  readonly observedReference: string;
}

/**
 * What the system expected beside what the operator submitted (`740:33`,
 * `740:66`).
 *
 * ## The screen does not judge the comparison
 *
 * The frames annotate each row with "khớp" or "lệch …". This implementation
 * shows the two values side by side and states, once, that the match is the
 * server's decision — because it is, and because the client provably cannot
 * reproduce it. The drawn success case is the proof: `740:48` matches an
 * expected `ORDK7M2Q9XR4TDC` against an observed `CK COC DON HANG ordk7m2q9xr4tdc
 * - Nguyen Van A…` — lower-case, embedded in a longer sentence, and still a
 * match. A per-row verdict computed here would have called that a mismatch and
 * contradicted the outcome shown directly beneath it.
 *
 * The overall verdict is not missing: it is the outcome badge the panel renders
 * from `attemptStatus`, which is the only authority either half of this
 * comparison has.
 *
 * ## Neither value is transformed
 *
 * The observed reference is rendered exactly as submitted, shortened for the
 * cell only when it is long enough to break the layout and revealable in full.
 * No amount is parsed, and no difference is computed.
 */
export function ExpectedObservedTable({
  expectedAmount,
  expectedReference,
  observedAmount,
  observedReference,
}: ExpectedObservedTableProps) {
  return (
    <div className="order-comparison">
      <p className="order-comparison__heading">{COPY.comparison.heading}</p>
      <table className="order-comparison__table" data-testid="expected-observed-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="order-comparison__sr-only">{COPY.comparison.heading}</span>
            </th>
            <th scope="col">{COPY.comparison.expected}</th>
            <th scope="col">{COPY.comparison.observed}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{COPY.comparison.amountRow}</th>
            <td data-testid="comparison-expected-amount">{expectedAmount}</td>
            <td data-testid="comparison-observed-amount">{observedAmount}</td>
          </tr>
          <tr>
            <th scope="row">{COPY.comparison.referenceRow}</th>
            <td data-testid="comparison-expected-reference">{expectedReference}</td>
            <td data-testid="comparison-observed-reference">
              <LongTextValue
                value={observedReference}
                label={COPY.comparison.referenceRow}
                testId="comparison-observed-reference-value"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="order-card__note">{COPY.comparison.serverJudged}</p>
    </div>
  );
}
