/**
 * What a refused merge operation means (`APP10-B02`, `APP10-B03`).
 *
 * ### None of the refusals carries a business code
 *
 * `customer-merge.errors.ts` raises every one as
 * `HttpException({ message }, status)` with no `code` field, exactly as
 * `APP10-B01` does. So on the wire:
 *
 * ```text
 * open    404 -> SURVIVOR_NOT_FOUND | LOSER_NOT_FOUND
 *         409 -> SURVIVOR_ALREADY_MERGED | LOSER_ALREADY_MERGED
 *                | MERGE_CASE_ALREADY_OPEN
 * reject  404 -> MERGE_CASE_NOT_FOUND
 *         409 -> MERGE_CASE_NOT_REQUESTED
 * execute 404 -> MERGE_CASE_NOT_FOUND
 *         409 -> MERGE_CASE_NOT_EXECUTABLE | MERGE_BUSINESS_PROFILE_CONFLICT
 *                | MERGE_CONTACT_COLLISION
 * ```
 *
 * Nothing here parses `message` to tell them apart. The wording is
 * server-authored prose that is free to change, and a screen that branched on a
 * sentence would break silently the first time somebody edited one.
 *
 * ### Execute refusals are read off a re-read of the case
 *
 * Two of the three execute conflicts *are* separable, but only from the
 * authoritative record rather than from the status line: a declined case says so
 * in its `status`, and a business-profile conflict says so in
 * `consequencePreview.businessProfile.conflict`. So the hook re-reads the case
 * and this classifier reads the reason off what the server now says is true —
 * explaining a refusal that has already happened, never predicting one.
 *
 * The remainder — a participant tombstoned by another merge since the preview,
 * and a contact that cannot be moved without discarding identity evidence —
 * stays **one** outcome, because it is one approved frame:
 * `FIG-APP10-A02-EXECUTE-PARTICIPANT-REFUSED` (`841:3`) covers both, and its copy
 * names both rather than picking the likelier. The detail read publishes no
 * merge tombstone and no contact-uniqueness signal, so a client that chose
 * between them would be inventing a distinction the API declines to publish.
 */
import type { AdminCustomerMergeCaseResponse } from '@embroidery/api-client';
import { AdminCustomerMergeCaseResponseStatus } from '@embroidery/api-client';

import { isCustomerAccessApiError } from '../../customer-access-support';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function statusOf(error: unknown): number | null {
  return isCustomerAccessApiError(error) ? (error.normalized.httpStatus ?? null) : null;
}

/**
 * Why a merge case could not be opened.
 *
 * - `validation` — the body was rejected; in practice a reason outside 1…1000.
 * - `participant-missing` — one of the two ids names no Customer. Both came from
 *   the exact-contact resolver, so this is a stale id rather than a discovery,
 *   and the screen does **not** say which side: the operator re-resolves.
 * - `conflict` — a case is already open for this ordered pair, or one of the two
 *   Customers has already been merged into another. The API publishes no code
 *   separating them and the copy names both.
 */
export type OpenMergeFailure =
  'validation' | 'participant-missing' | 'conflict' | 'unauthenticated' | 'forbidden' | 'generic';

export function classifyOpenFailure(error: unknown): OpenMergeFailure {
  switch (statusOf(error)) {
    case HTTP_BAD_REQUEST:
      return 'validation';
    case HTTP_NOT_FOUND:
      return 'participant-missing';
    case HTTP_CONFLICT:
      return 'conflict';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_FORBIDDEN:
      return 'forbidden';
    default:
      return 'generic';
  }
}

/**
 * Why an execution was refused.
 *
 * - `business-profile` — both Customers hold a business profile. A hard backend
 *   rule the UI fails closed with: there is no overwrite, no field merge, no
 *   delete-one and no continue-anyway, because every resolution available to
 *   code destroys something only a person may decide about.
 * - `not-executable` — the case was declined, so executing it would perform a
 *   merge nobody approved.
 * - `participant-or-contact` — the world changed under the preview: a
 *   participant was merged away, or a contact cannot move without discarding
 *   identity evidence. One state, because it is one approved frame.
 * - `stale` — the case no longer resolves.
 */
export type ExecuteMergeFailure =
  | 'business-profile'
  | 'not-executable'
  | 'participant-or-contact'
  | 'stale'
  | 'unauthenticated'
  | 'forbidden'
  | 'generic';

/**
 * `fresh` is the re-read case, or `undefined` when that read itself failed —
 * which is a case that no longer answers, whatever the mutation's status said.
 */
export function classifyExecuteFailure(
  error: unknown,
  fresh: AdminCustomerMergeCaseResponse | undefined,
): ExecuteMergeFailure {
  const status = statusOf(error);
  if (status === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (status === HTTP_FORBIDDEN) return 'forbidden';
  if (status === HTTP_NOT_FOUND) return 'stale';
  if (status !== HTTP_CONFLICT) return 'generic';

  if (fresh === undefined) return 'stale';
  if (fresh.status === AdminCustomerMergeCaseResponseStatus.REJECTED) return 'not-executable';
  if (fresh.consequencePreview.businessProfile.conflict) return 'business-profile';
  return 'participant-or-contact';
}

/**
 * Why a rejection was refused.
 *
 * `already-decided` is the only conflict this operation has, and it is
 * deliberately not idempotent: a rejection carries a mandatory reason, so
 * answering quietly would silently discard the second operator's words.
 */
export type RejectMergeFailure =
  'validation' | 'already-decided' | 'stale' | 'unauthenticated' | 'forbidden' | 'generic';

export function classifyRejectFailure(error: unknown): RejectMergeFailure {
  switch (statusOf(error)) {
    case HTTP_BAD_REQUEST:
      return 'validation';
    case HTTP_CONFLICT:
      return 'already-decided';
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
