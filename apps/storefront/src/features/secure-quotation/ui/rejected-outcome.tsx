import type { QuotationRejectedResponse } from '@embroidery/api-client';

import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';

/**
 * The committed-rejection block (`702:62`).
 *
 * Rejection moves the quotation and nothing else. The custom request is **not**
 * rejected and **not** cancelled — it stays in the quotation stage, where the
 * workshop can send a revised version — and the copy says so rather than
 * leaving the customer to assume their whole request is gone (`702:64`, §14).
 *
 * No amount appears here. Declining an offer commits nothing, so there is no
 * figure to report, and printing the total of a price that was refused would
 * only suggest an obligation that does not exist.
 *
 * The version number is repeated because on this path the version's terminal
 * state *is* the record: there is no rejection evidence row and no rejection
 * idempotency key, so the number is the thing to quote back to the workshop.
 */
export function RejectedOutcome({ outcome }: { outcome: QuotationRejectedResponse }) {
  return (
    <div className="secure-quotation__outcome secure-quotation__outcome--rejected" role="status">
      <p className="secure-quotation__outcome-title">{COPY.rejected.title}</p>
      <p className="secure-quotation__outcome-body">{COPY.rejected.body}</p>
      <p className="secure-quotation__outcome-note">{COPY.rejected.version(outcome.version)}</p>
    </div>
  );
}
