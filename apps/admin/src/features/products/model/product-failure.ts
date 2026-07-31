/**
 * The only error type the product services throw.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. The list renders one safe sentence for every failure — the `code`,
 * `requestId` and server `message` are deliberately never read for display.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export class ProductApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin product API call failed.');
    this.name = 'ProductApiError';
    this.normalized = normalized;
  }
}

export function isProductApiError(error: unknown): error is ProductApiError {
  return error instanceof ProductApiError;
}
