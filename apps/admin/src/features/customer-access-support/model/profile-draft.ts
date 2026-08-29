/**
 * The profile edit draft, and the patch it becomes.
 *
 * Two fields, `displayName` and `notes`, because those are the only two
 * `PATCH /api/admin/customers/{customerId}` accepts. Verification evidence,
 * merge state, anonymization and every contact are unreachable from the
 * operation and therefore have no field here — the form cannot express a write
 * the contract refuses.
 *
 * ### Only what changed travels
 *
 * The body's two fields are tri-state — omitted leaves the stored value
 * unchanged, `null` or a blank string clears it — so a patch that echoed both
 * fields back on every save would rewrite a note the operator never opened. The
 * draft is diffed against the authoritative detail and only the differing fields
 * are named. That is also what makes the audit summary honest: `APP10-B01`
 * records `changedFields`, and it can only be right if the request is.
 *
 * ### An unchanged draft never leaves the browser
 *
 * The server refuses a patch naming no field, and it refuses one that would
 * change nothing by writing nothing. Neither is a useful thing to spend a round
 * trip on, and neither has anywhere to be reported except next to the form —
 * so the emptiness is caught here, where the fields are.
 */
import type {
  AdminCustomerDetailResponse,
  UpdateCustomerProfileBody,
} from '@embroidery/api-client';

/** `customers.display_name` is uncapped in the database; `APP10-B01` bounds it. */
export const DISPLAY_NAME_MAX_LENGTH = 200;
/** Same rule for `customers.notes`, sized for a support note rather than a name. */
export const NOTES_MAX_LENGTH = 2_000;

export interface ProfileDraft {
  readonly displayName: string;
  readonly notes: string;
}

export type ProfileProblem = 'unchanged' | 'display-name-too-long' | 'notes-too-long';

export type ProfileValidation =
  | { readonly ok: true; readonly body: UpdateCustomerProfileBody }
  | { readonly ok: false; readonly problem: ProfileProblem };

/** The stored profile as the form shows it: an absent field is an empty field. */
export function draftOf(customer: AdminCustomerDetailResponse): ProfileDraft {
  return { displayName: customer.displayName ?? '', notes: customer.notes ?? '' };
}

/**
 * A blank field is a *clear*, not a store.
 *
 * A record holding a name that renders as nothing is a state with no meaning and
 * two ways to reach it, so the server maps blank to NULL and the client sends
 * the `null` that says so rather than a string of spaces.
 */
function wireValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function changed(draftValue: string, stored: string | undefined): boolean {
  return wireValue(draftValue) !== (stored ?? null);
}

export function validateProfileDraft(
  draft: ProfileDraft,
  customer: AdminCustomerDetailResponse,
): ProfileValidation {
  if (draft.displayName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, problem: 'display-name-too-long' };
  }
  if (draft.notes.trim().length > NOTES_MAX_LENGTH) {
    return { ok: false, problem: 'notes-too-long' };
  }

  const body: UpdateCustomerProfileBody = {
    ...(changed(draft.displayName, customer.displayName)
      ? { displayName: wireValue(draft.displayName) }
      : {}),
    ...(changed(draft.notes, customer.notes) ? { notes: wireValue(draft.notes) } : {}),
  };

  if (Object.keys(body).length === 0) return { ok: false, problem: 'unchanged' };
  return { ok: true, body };
}
