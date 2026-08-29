/**
 * What a refused maintenance mutation means (`APP10-B01`).
 *
 * ### The 409s carry no code, so status alone cannot separate them
 *
 * `customer-maintenance.errors.ts` raises every refusal as
 * `HttpException({ message }, status)` with **no** `code` field, so the envelope
 * falls back to the status-derived default and `CUSTOMER_MERGED`,
 * `CONTACT_IS_PRIMARY`, `CONTACT_IS_LAST_VERIFIED`, `CONTACT_NOT_VERIFIED` and
 * `CONTACT_NOT_ACTIVE` all arrive as an indistinguishable 409. Nothing here
 * parses `message` to tell them apart: the wording is server-authored prose that
 * is free to change, and a screen that branched on a sentence would break
 * silently the first time somebody edited it.
 *
 * The approved package nevertheless draws the primary refusal and the
 * last-verified refusal as two different states, so the conflict is resolved the
 * only honest way available: after the refusal the screen **re-reads the
 * authoritative customer** and reads the reason off what the server now says is
 * true. The classifier below therefore takes a *fresh* detail, not the snapshot
 * the operator clicked on — it explains a refusal that has already happened
 * rather than predicting one.
 *
 * Where the fresh read cannot separate two causes — a merged customer refuses a
 * contact transition with the same 409 as a state change, and the detail read
 * publishes no merge tombstone — the outcome stays the generic conflict, whose
 * copy names both possibilities. Guessing between them would be inventing a
 * distinction the API declines to publish.
 *
 * ### The profile patch is the one unambiguous case
 *
 * `PATCH /api/admin/customers/{customerId}` has exactly one 409:
 * `CUSTOMER_MERGED`. So there it is read directly, with no re-read needed.
 */
import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import { findContact, isLastVerified } from './contact-eligibility';
import { isCustomerAccessApiError } from './customer-access-failure';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function statusOf(error: unknown): number | null {
  return isCustomerAccessApiError(error) ? (error.normalized.httpStatus ?? null) : null;
}

/**
 * - `validation` — the patch was rejected as malformed or over-length.
 * - `merged` — the customer is the losing half of a completed merge and can no
 *   longer be maintained. Not resolvable from this screen, and deliberately not
 *   redirected to the survivor: the operator would believe they had edited the
 *   customer they addressed.
 * - `stale` — the customer no longer resolves.
 */
export type ProfileFailure =
  'validation' | 'merged' | 'stale' | 'unauthenticated' | 'forbidden' | 'generic';

export function classifyProfileFailure(error: unknown): ProfileFailure {
  switch (statusOf(error)) {
    case HTTP_BAD_REQUEST:
      return 'validation';
    case HTTP_CONFLICT:
      return 'merged';
    case HTTP_NOT_FOUND:
      return 'stale';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    default:
      return 'generic';
  }
}

/**
 * - `stale` — the customer or the contact is gone. A contact id belonging to
 *   another customer is answered exactly as one that names nothing, and this
 *   screen keeps that indistinguishable rather than reporting which.
 * - `unverified` — the contact has never completed a verification challenge, so
 *   it cannot become the default destination for the customer's notifications.
 * - `primary` — the contact is the current primary; a replacement must be
 *   promoted first, explicitly.
 * - `last-verified` — the contact is the customer's only verified one, and the
 *   identity exists because a verified contact was proven.
 * - `conflict` — the row moved for a reason the fresh read cannot name, the
 *   merged customer among them.
 */
export type ContactFailure =
  | 'stale'
  | 'unverified'
  | 'primary'
  | 'last-verified'
  | 'conflict'
  | 'unauthenticated'
  | 'forbidden'
  | 'generic';

export type ContactAction = 'promote' | 'deactivate';

/**
 * Reads a contact refusal against the customer as the server describes them
 * *now*.
 *
 * `fresh` is the re-read detail, or `undefined` when that read itself failed or
 * found nothing — which is a stale customer, whatever the mutation's own status
 * said.
 */
export function classifyContactFailure(
  action: ContactAction,
  error: unknown,
  fresh: AdminCustomerDetailResponse | undefined,
  contactId: string,
): ContactFailure {
  const status = statusOf(error);
  if (status === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (status === HTTP_FORBIDDEN) return 'forbidden';
  if (status === HTTP_NOT_FOUND) return 'stale';
  if (status !== HTTP_CONFLICT) return 'generic';

  if (fresh === undefined) return 'stale';
  const contact = findContact(fresh, contactId);
  // Gone from the current list means deactivated — by this operator's own
  // request racing itself, or by somebody else. Either way there is nothing
  // left to transition and nothing to explain beyond that.
  if (contact === undefined) return 'stale';

  if (action === 'promote') {
    return contact.verified ? 'conflict' : 'unverified';
  }
  if (contact.primary) return 'primary';
  if (isLastVerified(fresh, contact)) return 'last-verified';
  return 'conflict';
}
