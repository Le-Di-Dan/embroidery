import type { ApiFieldError } from '@embroidery/contracts';

/**
 * Normalized error shape exposed to feature services and UI layers.
 * Raw Axios errors must not leak past the api-client boundary.
 */
export interface NormalizedApiError {
  /** Stable machine-readable code (envelope code or client-side code). */
  code: string;
  /** Human-readable message; never used for programmatic branching. */
  message: string;
  /** HTTP status when a response was received. */
  httpStatus?: number;
  /** Correlation id from the envelope meta when available. */
  requestId?: string;
  /** Structured field errors from the envelope when available. */
  fieldErrors?: ApiFieldError[];
}
