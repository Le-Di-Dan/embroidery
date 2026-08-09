/**
 * Classifying the editor's failures into the few the screen behaves differently
 * about.
 *
 * ## The `409` carries no discriminator, so the server is asked instead
 *
 * `APP3-B03A` publishes one `409` for **two** different situations — its own
 * description says so: *"Stale `expectedCurrentVersion`, or a template that is
 * not a DRAFT."* They call for opposite responses. A stale version means the
 * operator's work is still valid and needs rebasing; a template that stopped
 * being a draft means no save will ever succeed. Offering "keep your local
 * draft" to someone whose draft can never be saved is the failure to avoid.
 *
 * The obvious discriminator would be the envelope `code` — but there is not
 * one. Verified against the running API: both causes are raised as a NestJS
 * `ConflictException`, and the envelope filter reduces every one of those to
 * `code: "CONFLICT"`. The internal vocabulary
 * (`DESIGN_TEMPLATE_VERSION_CONFLICT`, `DESIGN_TEMPLATE_NOT_EDITABLE`) never
 * leaves the server, and the only field that differs is `message`, which must
 * never be branched on.
 *
 * So the cause is resolved from **authoritative state** rather than guessed
 * from the refusal: a `409` triggers a fresh detail read, and the template's
 * own status says which guard refused. Still `DRAFT` — the version guard, so
 * the operator gets the conflict decision. No longer `DRAFT` — the editability
 * guard, so the operator is told the template left draft.
 *
 * This is stronger than a transcribed code would have been. It needs nothing
 * that is not in the published contract, it cannot drift out of step with a
 * server vocabulary no one is obliged to keep stable, and the read it performs
 * is the one the operator may be about to ask for anyway.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export class TemplateEditorApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin design template editor API call failed.');
    this.name = 'TemplateEditorApiError';
    this.normalized = normalized;
  }
}

export function isTemplateEditorApiError(error: unknown): error is TemplateEditorApiError {
  return error instanceof TemplateEditorApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isTemplateEditorApiError(error) ? error.normalized : null;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

export type LoadFailure = 'not-found' | 'generic';

export function classifyLoadFailure(error: unknown): LoadFailure {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND ? 'not-found' : 'generic';
}

export type SaveFailure =
  /** The server holds a newer version; nothing of the operator's was written. */
  | 'stale-version'
  /** The template stopped being a DRAFT; reloading is the only way forward. */
  | 'not-editable'
  /** `APP3-P01`/`APP3-B03A` refused the document itself. */
  | 'document-rejected'
  | 'generic';

/**
 * The `409` that needs a second question before it can be answered.
 *
 * Deliberately **not** a `SaveFailure`: nothing may present this to an operator,
 * because at this point the screen genuinely does not know which of the two
 * guards refused. It is resolved by `resolveConflictCause` against a fresh read.
 */
export type UnresolvedConflict = 'conflict-unresolved';

export function classifySaveFailure(error: unknown): SaveFailure | UnresolvedConflict {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_CONFLICT) return 'conflict-unresolved';
  return normalized.httpStatus === HTTP_UNPROCESSABLE ? 'document-rejected' : 'generic';
}

/**
 * Which guard refused, decided by the template's own status.
 *
 * `undefined` — the re-read itself failed — resolves to `stale-version`, and the
 * direction of that default is deliberate. It is the recoverable branch: it
 * preserves the operator's draft and offers them the choice. Defaulting the
 * other way would tell someone their template had left draft on no evidence,
 * and the copy for that state invites them to reload and lose their work.
 */
export function resolveConflictCause(
  status: string | undefined,
): Extract<SaveFailure, 'stale-version' | 'not-editable'> {
  if (status === undefined) return 'stale-version';
  return status === 'DRAFT' ? 'stale-version' : 'not-editable';
}

export type AssignScopeFailure =
  /**
   * The Template is no longer a candidate for an initial assignment: it already
   * has a scope, it has a version, or it left `DRAFT`.
   *
   * `APP3-B03B` answers `409` for all three and does not say which — deliberately,
   * so a caller cannot learn a Template's lifecycle state from a write it was
   * not allowed to make. The screen therefore re-reads the Template rather than
   * guessing, exactly as the save path does for its own `409`.
   */
  | 'not-assignable'
  /** The triple does not resolve, or names a retired Side or Area. */
  | 'scope-invalid'
  | 'generic';

export function classifyAssignScopeFailure(error: unknown): AssignScopeFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_CONFLICT) return 'not-assignable';
  return normalized.httpStatus === HTTP_BAD_REQUEST ? 'scope-invalid' : 'generic';
}

/**
 * What a lost race means for the operator, decided from the re-read.
 *
 * Another tab may have assigned first. If the Template now carries a scope, the
 * winner's triple is simply the truth and the editor continues from it — there
 * is nothing to recover and nothing to retry. Anything else means the Template
 * stopped being assignable for a different reason, and the ordinary blocked
 * states already describe that.
 */
export function scopeRaceOutcome(scopeAssigned: boolean): 'accept-server-scope' | 'blocked' {
  return scopeAssigned ? 'accept-server-scope' : 'blocked';
}

export type BackgroundFailure = 'unavailable' | 'retryable';

export function classifyBackgroundFailure(error: unknown): BackgroundFailure {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND ? 'unavailable' : 'retryable';
}
