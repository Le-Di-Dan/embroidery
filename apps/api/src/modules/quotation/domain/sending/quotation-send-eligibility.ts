/**
 * What may be sent, and what a repeat send means (`TR-LC12-02`, `APP6-B03`).
 *
 * ### The request rule is narrower than the drafting rule, deliberately
 *
 * `quotation-eligibility.ts` allows a **draft** to be written against any
 * request from `UNDER_REVIEW` onward, because ADR-DB3-001 rule 4 re-prices by
 * adding a version. Sending one is a different question: a send projects
 * `TR-LC11-05` `UNDER_REVIEW → QUOTED`, and LC-11 offers no other edge into
 * `QUOTED`.
 *
 * - `UNDER_REVIEW` — the canonical send. The projection applies.
 * - `QUOTED` — a legitimate newer version replaces the customer-current one.
 *   The request is already where the send would put it, so **no** transition is
 *   appended: a `QUOTED → QUOTED` row would be a self-edge LC-11 does not have
 *   and evidence of a move that never happened.
 * - everything else refuses.
 *
 * `NEEDS_CLARIFICATION` refuses because LC-11 routes it back through
 * `UNDER_REVIEW`, so the operator's move is to return the request to review and
 * then send. `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW` and `APPROVED`
 * refuse because a re-quote there would need re-acceptance (ADR-DB3-001 rule 4)
 * and `TR-LC11-06` runs only from `QUOTED` — which LC-11 cannot re-enter from
 * any of them. Sending anyway would freeze a version that no customer could ever
 * accept, and inventing the reopening edge is exactly what `APP6-G01` §4.1
 * forbids. `REJECTED` and `CANCELLED` are terminal. The unresolved re-quote
 * edge is reported as a follow-up, not decided here.
 *
 * ### The version rule is the freeze
 *
 * Only a `DRAFT` may be sent. A `SENT` version that is still the quotation's
 * current one is a **replay** — the same command, answered with the committed
 * result and nothing rewritten (`DB3_LIFECYCLE_SPECIFICATIONS.md` LC-12:
 * "resend replays"). Every other state — `ACCEPTED`, `SUPERSEDED`, `EXPIRED`,
 * `REJECTED`, `VOID` — refuses, because re-sending a settled version would put
 * a closed price back in play.
 */
import type { CustomRequestState } from '@embroidery/database';

/** The two request states `TR-LC12-02` may be committed from. */
export const SENDABLE_REQUEST_STATES: readonly CustomRequestState[] = ['UNDER_REVIEW', 'QUOTED'];

/**
 * The one state whose send projects `TR-LC11-05`.
 *
 * Named separately from the sendable set so "which states may send" and "which
 * send also moves the request" cannot be conflated into one list that answers
 * both questions wrongly the first time a third state is added.
 */
export const PROJECTING_REQUEST_STATE: CustomRequestState = 'UNDER_REVIEW';

export function isSendableRequestState(status: string): boolean {
  return (SENDABLE_REQUEST_STATES as readonly string[]).includes(status);
}

export function projectsQuoted(status: string): boolean {
  return status === PROJECTING_REQUEST_STATE;
}
