/**
 * The legal Custom Request state transitions (LC-11, GRD-019).
 *
 * `ck_custom_requests__status_allowed` constrains the *value* of `status`; no
 * database constraint constrains the *move*. Without this table any state could
 * follow any other, including a completed request sliding back to NEW.
 *
 * Declared once here so the guard has a single source, rather than being
 * scattered across the methods that transition (DB7 §13.1).
 */
import type { CustomRequestState } from '@embroidery/database';

/**
 * Allowed destinations per state, from `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-11.
 *
 * Terminal states map to an empty set: REJECTED and CANCELLED are ends, and a
 * request that reached one is reopened by a new request, not by a transition.
 */
const ALLOWED: Readonly<Record<CustomRequestState, readonly CustomRequestState[]>> = {
  NEW: ['UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['NEEDS_CLARIFICATION', 'QUOTED', 'REJECTED', 'CANCELLED'],
  NEEDS_CLARIFICATION: ['UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  QUOTED: ['QUOTE_ACCEPTED', 'UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  QUOTE_ACCEPTED: ['DIGITIZING', 'CANCELLED'],
  DIGITIZING: ['DESIGN_REVIEW', 'CANCELLED'],
  DESIGN_REVIEW: ['DIGITIZING', 'APPROVED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export function isLegalRequestTransition(
  from: CustomRequestState,
  to: CustomRequestState,
): boolean {
  return ALLOWED[from].includes(to);
}

export function legalDestinations(from: CustomRequestState): readonly CustomRequestState[] {
  return ALLOWED[from];
}
