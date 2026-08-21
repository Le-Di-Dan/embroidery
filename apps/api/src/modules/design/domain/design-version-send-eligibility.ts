/**
 * When a formal Design Version may be sent, and what that does to the request —
 * `TR-LC08-02`'s request-side rule (`APP6-B09`).
 *
 * Two functions over one list, kept apart from `APP6-B08`'s authoring rule even
 * though today the two lists have the same members. They answer different
 * questions and are allowed to diverge: authoring asks which states may *gain* a
 * draft, sending asks which states a frozen version may *leave* from. Collapsing
 * them into one exported constant would make a later change to either silently
 * change the other.
 *
 * - **`DIGITIZING`** is the first review send. `GRD-005` gated entry to it on an
 *   accepted quotation, so a sendable request is by construction one whose price
 *   the customer already agreed to. This is the state that projects
 *   `TR-LC11-08`.
 * - **`DESIGN_REVIEW`** is a **revision** send. `APP6-B08` permits authoring a
 *   new version while the request sits here, so the state it sits in must admit
 *   sending that version — a request that had to be moved backwards first would
 *   be a lifecycle rewrite performed to make a write legal.
 *
 * Everything else refuses, and there is no Admin override. Neither a backward
 * nor a forward LC-11 edge is opened to make a send succeed.
 */
import type { CustomRequestState } from '@embroidery/database';

export const VERSION_SENDABLE_REQUEST_STATES: readonly CustomRequestState[] = Object.freeze([
  'DIGITIZING',
  'DESIGN_REVIEW',
]);

export function isVersionSendableState(status: CustomRequestState): boolean {
  return VERSION_SENDABLE_REQUEST_STATES.includes(status);
}

/**
 * Whether this send projects `TR-LC11-08`.
 *
 * Only from `DIGITIZING`. A request already in `DESIGN_REVIEW` stays there and
 * **no transition row is appended**: LC-11 has no self-edge, and a
 * `DESIGN_REVIEW → DESIGN_REVIEW` row would be a lifecycle event claiming the
 * request moved when it did not. The new review version is an LC-08 fact, and
 * `design_versions` plus the `design_version.sent` audit row are where it is
 * recorded.
 */
export function projectsDesignReview(status: CustomRequestState): boolean {
  return status === 'DIGITIZING';
}
