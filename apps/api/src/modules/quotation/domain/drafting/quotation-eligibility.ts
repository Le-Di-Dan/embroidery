/**
 * Which subjects a draft may be written against (`TR-LC12-01`, `APP6-B01`).
 *
 * ### The request rule
 *
 * DB3 states the `TR-LC12-01` guard as **"request ≥ UNDER_REVIEW"**. LC-11
 * describes the request lifecycle as a progression —
 * `NEW → UNDER_REVIEW → NEEDS_CLARIFICATION → QUOTED → QUOTE_ACCEPTED →
 * DIGITIZING → DESIGN_REVIEW → APPROVED` — with `REJECTED` and `CANCELLED`
 * marked **terminal**, that is, off that scale rather than above its top.
 * "≥ UNDER_REVIEW" therefore names the progression from `UNDER_REVIEW` onward:
 * `NEW` is below it, and the two terminal outcomes are not on it at all.
 *
 * It is written as an explicit set, not as an index comparison against
 * `CUSTOM_REQUEST_STATES`. That array's order is a declaration order that
 * happens to match the progression today; making a lifecycle guard depend on it
 * would turn a future reordering into a silent authorization change.
 *
 * The rule is neither tightened nor loosened here. Quoting a request that is
 * already `QUOTED` or `QUOTE_ACCEPTED` is deliberately allowed: ADR-DB3-001
 * rule 4 re-prices by adding a **new version**, and refusing that would make the
 * documented re-quote path unreachable.
 *
 * ### The quotation rule
 *
 * A further version may be drafted on any quotation that has not reached a
 * terminal header state. LC-12 marks `REJECTED` and `CANCELLED` terminal and
 * says `EXPIRED` is "re-activatable by new version", and rule 4 requires a new
 * version on an `ACCEPTED` quotation for re-acceptance — so only the two
 * terminal states refuse.
 */
import type { CustomRequestState, QuotationState } from '@embroidery/database';

/** `TR-LC12-01`: request ≥ UNDER_REVIEW, terminal outcomes excluded. */
export const QUOTABLE_REQUEST_STATES: readonly CustomRequestState[] = [
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
];

/** LC-12 header states that still accept a further draft version. */
export const DRAFTABLE_QUOTATION_STATES: readonly QuotationState[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'EXPIRED',
];

export function isQuotableRequestState(status: string): boolean {
  return (QUOTABLE_REQUEST_STATES as readonly string[]).includes(status);
}

export function isDraftableQuotationState(status: string): boolean {
  return (DRAFTABLE_QUOTATION_STATES as readonly string[]).includes(status);
}
