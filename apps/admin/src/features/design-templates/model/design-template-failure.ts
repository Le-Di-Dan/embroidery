/**
 * The only error type the Design Template services throw, and how it is read.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. Every operator-facing string is chosen from the copy catalog by the
 * classification alone — the `code`, `requestId` and server `message` are
 * deliberately never read for display.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export class DesignTemplateApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin design template API call failed.');
    this.name = 'DesignTemplateApiError';
    this.normalized = normalized;
  }
}

export function isDesignTemplateApiError(error: unknown): error is DesignTemplateApiError {
  return error instanceof DesignTemplateApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isDesignTemplateApiError(error) ? error.normalized : null;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

/**
 * Whether a failed page fetch was the cursor's fault.
 *
 * `APP3-B03` answers `400` for a malformed or unparseable cursor. That is worth
 * distinguishing because the advice differs: a transport failure is worth
 * retrying with the *same* cursor, while a rejected cursor never will be — the
 * operator has to reload the list from its first page. Retrying a bad cursor
 * forever, or silently restarting the collection behind their back, are the two
 * wrong answers this separates.
 */
export function isCursorRejected(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_BAD_REQUEST;
}

/**
 * What a failed create means for the dialog.
 *
 * `address-unreserved` is the create `409`, which `APP3-B03` publishes as *"No
 * template address could be reserved"*. It is deliberately **not** "that name is
 * taken": `deriveTemplateSlugBase` is a pure function of the name, and a
 * collision on it falls back to `deriveTemplateSlugFallback`, which appends the
 * new Template's **own id**. Two templates may therefore share a name — verified
 * in the browser, where creating the same name twice succeeded — and the only
 * way to reach this status is for the id-suffixed address to collide as well.
 *
 * That distinction decides the advice. Telling the operator to pick a different
 * name would be false (the name was never the constraint) and useless (a retry
 * gets a new id, hence a new fallback address). So the copy asks for a retry.
 */
export type CreateTemplateFailure = 'address-unreserved' | 'generic';

export function classifyCreateFailure(error: unknown): CreateTemplateFailure {
  return normalizedOf(error)?.httpStatus === HTTP_CONFLICT ? 'address-unreserved' : 'generic';
}
