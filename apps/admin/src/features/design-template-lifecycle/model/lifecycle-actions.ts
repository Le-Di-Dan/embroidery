/**
 * Which LC-24 transitions this Template may make right now.
 *
 * The matrix is a **table**, not a chain of conditionals, because the property
 * that matters is what is *absent* from it. `IMP-D042` recognises six
 * transitions and this screen offers four of them; the ones that must never
 * appear — `ARCHIVED → PUBLISHED`, an unpublish from `ARCHIVED`, a restore from
 * anything but `ARCHIVED`, a delete — are absent by construction rather than
 * refused by a guard someone has to remember to write.
 *
 *   DRAFT      publish · archive
 *   PUBLISHED  unpublish · archive
 *   ARCHIVED   restore
 *
 * There is deliberately no `restore-and-publish`. Restore lands in `DRAFT` and
 * republication is a separate guarded command that re-runs the whole GRD-T01
 * set; chaining them here would publish a Template whose readiness nobody
 * re-checked.
 */
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

export const LIFECYCLE_ACTIONS = ['publish', 'unpublish', 'archive', 'restore'] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/** The three states `APP3-B03`'s projection can report. */
export type TemplateLifecycleStatus = AdminDesignTemplateDetailResponse['status'];

/**
 * The whole matrix, frozen.
 *
 * Every key is a status the contract can return, so a fourth state added to the
 * enum stops compiling here rather than silently offering no action at all.
 */
export const ACTIONS_BY_STATUS: Readonly<Record<string, readonly LifecycleAction[]>> =
  Object.freeze({
    DRAFT: Object.freeze(['publish', 'archive'] as const),
    PUBLISHED: Object.freeze(['unpublish', 'archive'] as const),
    ARCHIVED: Object.freeze(['restore'] as const),
  });

/** The actions offered for a status; an unknown status offers none. */
export function actionsFor(status: string | undefined): readonly LifecycleAction[] {
  return status === undefined ? [] : (ACTIONS_BY_STATUS[status] ?? []);
}

export function isActionOffered(status: string | undefined, action: LifecycleAction): boolean {
  return actionsFor(status).includes(action);
}

/**
 * The two transitions `IMP-D042` PO-03 requires a reason for — archive and
 * restore, and neither of the other two. A reason invented for publish would be
 * evidence the operator never gave.
 */
export const REASONED_ACTIONS: readonly LifecycleAction[] = Object.freeze([
  'archive',
  'restore',
] as const);

export function requiresReason(action: LifecycleAction): boolean {
  return REASONED_ACTIONS.includes(action);
}

/** Mirrors the server bound (`TEMPLATE_LIFECYCLE_REASON_MAX_LENGTH`). */
export const REASON_MAX_LENGTH = 500;

export type ReasonProblem = 'blank' | 'too-long';

/**
 * The reason a command will actually send, or why it cannot be sent.
 *
 * Trimmed before both the length check and the send: a reason of spaces
 * satisfies "required" and none of its purpose, and an untrimmed value would let
 * whitespace consume the operator's 500 characters.
 */
export function validateReason(
  raw: string,
): { ok: true; value: string } | { ok: false; problem: ReasonProblem } {
  const value = raw.trim();
  if (value === '') return { ok: false, problem: 'blank' };
  if (value.length > REASON_MAX_LENGTH) return { ok: false, problem: 'too-long' };
  return { ok: true, value };
}
