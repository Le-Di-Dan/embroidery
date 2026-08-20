/**
 * What a committed send looks like to the operator who commanded it
 * (`APP6-B03`).
 *
 * It reuses `APP6-B02`'s version and line views rather than defining a second
 * shape for the same row: the operator's confirmation is the version they just
 * sent, read exactly as the archive reads it. A second definition would be a
 * second answer to "what did version 3 cost", and the two would drift the first
 * time a column was added.
 *
 * Three facts are the send's own:
 *
 * - `requestStatus` — where the request stands **after** the transaction, which
 *   is how the caller sees the `TR-LC11-05` projection without a second read;
 * - `requestTransitioned` — whether this send projected that transition. `false`
 *   on a send from an already-`QUOTED` request, which appends no transition row
 *   at all;
 * - `replayed` — whether this call re-sent an already-sent version and therefore
 *   wrote nothing.
 */
import type {
  QuotationHeaderView,
  QuotationLineItemView,
  QuotationVersionView,
} from '../reads/quotation-version.view';

export interface QuotationSentView {
  readonly quotation: QuotationHeaderView;
  readonly version: QuotationVersionView;
  readonly lineItems: readonly QuotationLineItemView[];
  readonly requestStatus: string;
  readonly requestTransitioned: boolean;
  readonly replayed: boolean;
}
