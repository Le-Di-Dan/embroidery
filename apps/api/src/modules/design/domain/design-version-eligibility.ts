/**
 * When a formal Design Version may be authored — `TR-LC08-01`'s guard.
 *
 * `DB3_LIFECYCLE_SPECIFICATIONS.md` states it exactly: *"request state ∈
 * {DIGITIZING, DESIGN_REVIEW}"*. Two states, and each is here for its own
 * reason:
 *
 * - **`DIGITIZING`** is where the first formal version is authored.
 *   `GRD-005` gates entry to it on an accepted quotation and `APP6-B06` owns
 *   the `QUOTE_ACCEPTED → DIGITIZING` transition, so an eligible request is by
 *   construction one whose price the customer has already agreed to.
 * - **`DESIGN_REVIEW`** is where a **revision** is authored. LC-08 makes a
 *   revision a new version rather than an edit (`TR-LC08-01` again, then
 *   `TR-LC08-05` supersedes the old one at send), so the state a request sits in
 *   while awaiting or answering a review decision must admit authoring — a
 *   request that had to be moved backwards first would be a lifecycle rewrite to
 *   make a write legal.
 *
 * Everything else refuses, and there is **no Admin override**. A request that is
 * `QUOTED` has an unaccepted price; one that is `NEW` or `UNDER_REVIEW` has no
 * price at all; one that is `APPROVED`, `REJECTED` or `CANCELLED` is settled.
 * An override on this guard would make `GRD-005` advisory, which is the one
 * thing it must not be.
 *
 * ADR-DB3-003's post-approval reopen path is the same rule seen later: it
 * produces a new version through this transition, and it does so by moving the
 * request back into an eligible state first rather than by widening this list.
 * Nothing here needs to know about it.
 */
import type { CustomRequestState } from '@embroidery/database';

export const VERSION_AUTHORABLE_REQUEST_STATES: readonly CustomRequestState[] = Object.freeze([
  'DIGITIZING',
  'DESIGN_REVIEW',
]);

export function isVersionAuthorableState(status: CustomRequestState): boolean {
  return VERSION_AUTHORABLE_REQUEST_STATES.includes(status);
}
