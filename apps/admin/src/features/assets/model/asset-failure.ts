/**
 * Translation from a normalized API error into a safe, actionable outcome.
 *
 * Only the stable machine-readable `code` and the HTTP status are read. The
 * server `message`, the `requestId`, the field errors and every native Axios
 * property are deliberately dropped here — this is the single point where a
 * backend failure becomes user-facing text, so a technical detail cannot leak
 * past it even by accident.
 */
import { API_CLIENT_ERROR_CODES, type NormalizedApiError } from '@embroidery/api-client';

import { ASSET_COPY } from './asset-copy';
import type { FileRejectionReason } from './asset-upload-policy';

/**
 * The only error type the asset services throw. It carries the normalized
 * envelope error and nothing else, so no Axios instance, request config or
 * multipart body can travel with it into a React state value.
 */
export class AssetApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin asset API call failed.');
    this.name = 'AssetApiError';
    this.normalized = normalized;
  }
}

export function isAssetApiError(error: unknown): error is AssetApiError {
  return error instanceof AssetApiError;
}

/**
 * Maps any thrown value to safe copy. A non-API throw (a bug, a missing Web
 * Crypto implementation) becomes the neutral fallback rather than surfacing a
 * native message.
 */
export function describeUnknownFailure(error: unknown): AssetFailure {
  return isAssetApiError(error)
    ? describeApiFailure(error.normalized)
    : { message: ASSET_COPY.errors.unexpected, retryable: false, sessionExpired: false };
}

/** A failure the operator can read, plus whether retrying is even sensible. */
export interface AssetFailure {
  readonly message: string;
  /** True when the same file and the same upload intent may be retried. */
  readonly retryable: boolean;
  /** True when the session ended; the shell owns the single auth redirect. */
  readonly sessionExpired: boolean;
}

const UNAUTHORIZED = 401;
const TOO_MANY_REQUESTS = 429;

/** Business codes whose remedy is choosing a different file, not retrying. */
const TERMINAL_BY_CODE: Readonly<Record<string, string>> = {
  ASSET_UPLOAD_MEDIA_UNSUPPORTED: ASSET_COPY.errors.mediaUnsupported,
  ASSET_UPLOAD_SIGNATURE_MISMATCH: ASSET_COPY.errors.signatureMismatch,
  ASSET_UPLOAD_TOO_LARGE: ASSET_COPY.errors.tooLarge,
  ASSET_UPLOAD_INVALID_MULTIPART: ASSET_COPY.errors.metadataInvalid,
  ASSET_UPLOAD_METADATA_INVALID: ASSET_COPY.errors.metadataInvalid,
  IDEMPOTENCY_KEY_INVALID: ASSET_COPY.errors.metadataInvalid,
  IDEMPOTENCY_CONFLICT: ASSET_COPY.errors.idempotencyConflict,
  STALE_UPLOAD_CLAIM: ASSET_COPY.errors.stateConflict,
  ASSET_UPLOAD_STATE_CONFLICT: ASSET_COPY.errors.stateConflict,
  ASSET_NOT_FOUND: ASSET_COPY.errors.notFound,
};

/** Codes where the same intent may safely be sent again. */
const RETRYABLE_BY_CODE: Readonly<Record<string, string>> = {
  ASSET_UPLOAD_IN_PROGRESS: ASSET_COPY.errors.uploadInProgress,
  ASSET_UPLOAD_TIMEOUT: ASSET_COPY.errors.timeout,
  ASSET_STORAGE_UNAVAILABLE: ASSET_COPY.errors.unavailable,
  [API_CLIENT_ERROR_CODES.timeout]: ASSET_COPY.errors.timeout,
  [API_CLIENT_ERROR_CODES.network]: ASSET_COPY.errors.network,
};

/** Local pre-flight rejections; the request is never sent. */
const LOCAL_REJECTION: Readonly<Record<FileRejectionReason, string>> = {
  NO_FILE: ASSET_COPY.errors.metadataInvalid,
  MULTIPLE_FILES: ASSET_COPY.errors.multipleFiles,
  MEDIA_UNSUPPORTED: ASSET_COPY.errors.mediaUnsupported,
  TOO_LARGE: ASSET_COPY.errors.tooLarge,
};

export function describeLocalRejection(reason: FileRejectionReason): AssetFailure {
  return { message: LOCAL_REJECTION[reason], retryable: false, sessionExpired: false };
}

/**
 * Maps a normalized API error to safe copy. A 5xx that the platform filter
 * already collapsed to a generic code is treated as retryable; an unrecognised
 * 4xx is not, because repeating a rejected request cannot help.
 */
export function describeApiFailure(error: NormalizedApiError): AssetFailure {
  if (error.httpStatus === UNAUTHORIZED) {
    return { message: ASSET_COPY.errors.sessionExpired, retryable: false, sessionExpired: true };
  }
  if (error.httpStatus === TOO_MANY_REQUESTS) {
    return { message: ASSET_COPY.errors.rateLimited, retryable: true, sessionExpired: false };
  }

  const terminal = TERMINAL_BY_CODE[error.code];
  if (terminal !== undefined) {
    return { message: terminal, retryable: false, sessionExpired: false };
  }

  const retryable = RETRYABLE_BY_CODE[error.code];
  if (retryable !== undefined) {
    return { message: retryable, retryable: true, sessionExpired: false };
  }

  const serverFault = error.httpStatus !== undefined && error.httpStatus >= 500;
  return {
    message: serverFault ? ASSET_COPY.errors.unavailable : ASSET_COPY.errors.unexpected,
    retryable: serverFault,
    sessionExpired: false,
  };
}
