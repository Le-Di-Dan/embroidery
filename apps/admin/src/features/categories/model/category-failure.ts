/**
 * The only error type the category services throw (`APP12-A01`).
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server prose can travel with it into React
 * state. The screen renders approved copy for every failure; the server
 * `message`, `requestId` and any field detail are never read for display,
 * because a category refusal can name a slug, a table or a constraint.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export class CategoryApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin category API call failed.');
    this.name = 'CategoryApiError';
    this.normalized = normalized;
  }
}

export function isCategoryApiError(error: unknown): error is CategoryApiError {
  return error instanceof CategoryApiError;
}
