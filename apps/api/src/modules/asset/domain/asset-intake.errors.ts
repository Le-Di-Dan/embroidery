/**
 * The feature-owned safe error contract for Admin asset intake (`APP2-B01` §20).
 *
 * `API_ERROR_CODE` is deliberately a transport-level set only — the platform
 * envelope states that business codes belong to the feature that owns the rule.
 * These are that feature's codes.
 *
 * **Recorded platform behaviour, not a bypass:** the canonical exception mapper
 * replaces *every* 5xx code and message with `INTERNAL_SERVER_ERROR` and the
 * generic text, because a server-fault message may have been built from an
 * internal failure. So `IDEMPOTENCY_RESULT_INVALID` (500) and
 * `ASSET_STORAGE_UNAVAILABLE` (503) keep their **status** on the wire but reach
 * the client as the generic server-fault code. They are named here because they
 * are the operator-facing names, and because the status is the part a client
 * can act on. Every 4xx code below does reach the client verbatim.
 */
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  type HttpException,
} from '@nestjs/common';

export const ASSET_INTAKE_ERROR_CODES = [
  'ASSET_UPLOAD_INVALID_MULTIPART',
  'ASSET_UPLOAD_METADATA_INVALID',
  'IDEMPOTENCY_KEY_INVALID',
  'ASSET_UPLOAD_TOO_LARGE',
  'ASSET_UPLOAD_MEDIA_UNSUPPORTED',
  'ASSET_UPLOAD_SIGNATURE_MISMATCH',
  'IDEMPOTENCY_CONFLICT',
  'ASSET_UPLOAD_IN_PROGRESS',
  'STALE_UPLOAD_CLAIM',
  'ASSET_UPLOAD_STATE_CONFLICT',
  'ASSET_NOT_FOUND',
  'ASSET_UPLOAD_TIMEOUT',
  'ASSET_STORAGE_UNAVAILABLE',
  'IDEMPOTENCY_RESULT_INVALID',
] as const;

export type AssetIntakeErrorCode = (typeof ASSET_INTAKE_ERROR_CODES)[number];

/**
 * Client-safe messages. None names a bucket, key, claim token, SQL fragment,
 * provider, filename or actor — the message is the only free text that reaches
 * a browser, so it is written once here and never interpolated at a call site.
 */
const MESSAGES: Record<AssetIntakeErrorCode, string> = {
  ASSET_UPLOAD_INVALID_MULTIPART: 'The upload request is not a valid single-file multipart form.',
  ASSET_UPLOAD_METADATA_INVALID: 'The upload metadata is missing or not permitted.',
  IDEMPOTENCY_KEY_INVALID: 'The Idempotency-Key header is missing or malformed.',
  ASSET_UPLOAD_TOO_LARGE: 'The uploaded image exceeds the maximum permitted size.',
  ASSET_UPLOAD_MEDIA_UNSUPPORTED: 'Only PNG, JPEG and WebP images are accepted.',
  ASSET_UPLOAD_SIGNATURE_MISMATCH: 'The file content does not match its declared image type.',
  IDEMPOTENCY_CONFLICT: 'This idempotency key was already used for a different request.',
  ASSET_UPLOAD_IN_PROGRESS: 'An upload for this idempotency key is already in progress.',
  STALE_UPLOAD_CLAIM: 'This upload attempt is no longer the owner of its allocation.',
  ASSET_UPLOAD_STATE_CONFLICT: 'The asset is not in a state that allows this upload to finish.',
  ASSET_NOT_FOUND: 'That asset does not exist.',
  ASSET_UPLOAD_TIMEOUT: 'The upload took too long and was stopped.',
  ASSET_STORAGE_UNAVAILABLE: 'Image storage is temporarily unavailable. Please try again.',
  IDEMPOTENCY_RESULT_INVALID: 'The stored upload record could not be read safely.',
};

/**
 * The error every intake failure is expressed as before it becomes an
 * `HttpException`. Carrying the code as data (rather than throwing framework
 * exceptions from deep in the stream pipeline) keeps the parser, the codecs and
 * the state machine free of HTTP knowledge.
 */
export class AssetIntakeError extends Error {
  readonly code: AssetIntakeErrorCode;

  constructor(code: AssetIntakeErrorCode) {
    super(MESSAGES[code]);
    this.name = 'AssetIntakeError';
    this.code = code;
  }
}

export function isAssetIntakeError(error: unknown): error is AssetIntakeError {
  return error instanceof AssetIntakeError;
}

export function assetIntakeError(code: AssetIntakeErrorCode): AssetIntakeError {
  return new AssetIntakeError(code);
}

/** The exact HTTP status each code maps to (`APP2-B01` §20). */
const STATUS_BY_CODE: Record<AssetIntakeErrorCode, (payload: ErrorPayload) => HttpException> = {
  ASSET_UPLOAD_INVALID_MULTIPART: (payload) => new BadRequestException(payload),
  ASSET_UPLOAD_METADATA_INVALID: (payload) => new BadRequestException(payload),
  IDEMPOTENCY_KEY_INVALID: (payload) => new BadRequestException(payload),
  ASSET_UPLOAD_TOO_LARGE: (payload) => new PayloadTooLargeException(payload),
  ASSET_UPLOAD_MEDIA_UNSUPPORTED: (payload) => new UnsupportedMediaTypeException(payload),
  ASSET_UPLOAD_SIGNATURE_MISMATCH: (payload) => new UnsupportedMediaTypeException(payload),
  IDEMPOTENCY_CONFLICT: (payload) => new ConflictException(payload),
  ASSET_UPLOAD_IN_PROGRESS: (payload) => new ConflictException(payload),
  STALE_UPLOAD_CLAIM: (payload) => new ConflictException(payload),
  ASSET_UPLOAD_STATE_CONFLICT: (payload) => new ConflictException(payload),
  ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
  ASSET_UPLOAD_TIMEOUT: (payload) => new RequestTimeoutException(payload),
  ASSET_STORAGE_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
  IDEMPOTENCY_RESULT_INVALID: (payload) => new InternalServerErrorException(payload),
};

interface ErrorPayload {
  readonly code: AssetIntakeErrorCode;
  readonly message: string;
}

/** Converts the transport-free error into the canonical HTTP exception. */
export function toHttpException(error: AssetIntakeError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
