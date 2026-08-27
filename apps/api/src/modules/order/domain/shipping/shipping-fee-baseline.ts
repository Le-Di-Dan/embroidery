/**
 * The one rule for "what fee is this order on right now" (`APP9-B04` §7).
 *
 * Extracted from the Admin write by `APP9-B04-C1` because a second caller now
 * needs the identical answer: the customer's acknowledgement binds a
 * `previousFeeAmount`, the Admin write matches an acknowledgement against the
 * baseline it computes, and the two must be the same number or a valid customer
 * decision would silently fail to authorize the change it was made for. One
 * function is how that is guaranteed rather than promised.
 *
 * ```text
 * a stored shipping_details.fee_amount   -> that
 * no detail, or a detail with no fee     -> the ACCEPTED quotation version's
 *                                           frozen shipping_fee_amount
 * ```
 *
 * The quoted fee is the baseline for the **first** write because the live
 * `REMAINING` obligation was priced from a total that already includes it.
 * Treating "no detail yet" as a zero fee would turn every first write into a
 * full-fee increase; treating it as "no baseline" would let an operator create
 * a detail carrying a fee the customer never saw and move real money with no
 * recalculation and no acknowledgement at all.
 *
 * Reading the accepted version is not "rereading a mutable quotation as current
 * payment truth" (`APP9-B04` §9): an `ACCEPTED` version is frozen by INV-02, the
 * payable figure stays the obligation row throughout, and the quotation is
 * consulted only for the fee this order was created against.
 *
 * `undefined` when neither source parses. Unreachable through delivered paths —
 * `quotation_versions.shipping_fee_amount` is `numeric(14,2) NOT NULL` — but a
 * malformed baseline must be reported by the caller rather than defaulted.
 */
import { parseFeeAmount, type FeeAmount } from './shipping-fee-amount';

/** The two fields the rule reads. Structural, so both callers can satisfy it. */
export interface FeeBaselineSources {
  readonly storedFeeAmount: string | undefined;
  readonly quotedFeeAmount: string;
}

export function baselineFeeOf(sources: FeeBaselineSources): FeeAmount | undefined {
  const stored =
    sources.storedFeeAmount === undefined ? undefined : parseFeeAmount(sources.storedFeeAmount);
  return stored ?? parseFeeAmount(sources.quotedFeeAmount);
}
