/**
 * Closed provider-error taxonomy (APP2-I01 §10).
 *
 * Callers branch on `code`, never on an SDK exception name, so swapping the
 * S3-compatible provider cannot change business behaviour. A raw SDK error is
 * never re-thrown: its message can carry endpoint, bucket and header detail
 * that must not reach a response envelope or a log line.
 */

export const OBJECT_STORAGE_ERROR_CODES = [
  'OBJECT_NOT_FOUND',
  'ACCESS_DENIED',
  'CONFLICT',
  'REQUEST_ABORTED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'INVALID_PROVIDER_RESPONSE',
] as const;

export type ObjectStorageErrorCode = (typeof OBJECT_STORAGE_ERROR_CODES)[number];

/**
 * The only error type this package throws for a provider failure.
 *
 * `cause` keeps the original SDK error for a debugger and for the repository's
 * error-mapping conventions; `message` is written by this package and is safe
 * to log. Callers must not serialise `cause`.
 */
export class ObjectStorageError extends Error {
  public readonly code: ObjectStorageErrorCode;

  public constructor(code: ObjectStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStorageError';
    this.code = code;
  }
}

/** Configuration is a startup contract, not a provider failure — separate type. */
export class ObjectStorageConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ObjectStorageConfigError';
  }
}

/** A rejected key/prefix is a programming error at the call site, not a provider fault. */
export class ObjectKeyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ObjectKeyError';
  }
}

/** Unbounded or non-ASCII provider metadata — likewise a call-site error. */
export class ObjectMetadataError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ObjectMetadataError';
  }
}

const NOT_FOUND_NAMES = new Set(['NoSuchKey', 'NotFound', 'NoSuchBucket', 'NoSuchUpload']);
const ACCESS_DENIED_NAMES = new Set([
  'AccessDenied',
  'AllAccessDisabled',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredToken',
  'InvalidToken',
  'AccountProblem',
]);
const CONFLICT_NAMES = new Set([
  'BucketAlreadyExists',
  'BucketAlreadyOwnedByYou',
  'OperationAborted',
  'PreconditionFailed',
  'InvalidBucketState',
]);
const ABORT_NAMES = new Set(['AbortError', 'RequestAbortedError']);
const TIMEOUT_NAMES = new Set(['TimeoutError', 'RequestTimeout', 'RequestTimeTooSkewed']);
const UNAVAILABLE_NAMES = new Set([
  'ServiceUnavailable',
  'SlowDown',
  'InternalError',
  'NetworkingError',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const HTTP_STATUS_CODES: ReadonlyArray<readonly [number, ObjectStorageErrorCode]> = [
  [404, 'OBJECT_NOT_FOUND'],
  [403, 'ACCESS_DENIED'],
  [401, 'ACCESS_DENIED'],
  [409, 'CONFLICT'],
  [412, 'CONFLICT'],
  [408, 'PROVIDER_TIMEOUT'],
  [429, 'PROVIDER_UNAVAILABLE'],
  [500, 'PROVIDER_UNAVAILABLE'],
  [502, 'PROVIDER_UNAVAILABLE'],
  [503, 'PROVIDER_UNAVAILABLE'],
  [504, 'PROVIDER_TIMEOUT'],
];

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null || !(key in source)) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const metadata = (error as { $metadata?: unknown }).$metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return undefined;
  }
  const status = (metadata as { httpStatusCode?: unknown }).httpStatusCode;
  return typeof status === 'number' ? status : undefined;
}

function classifyByName(name: string | undefined): ObjectStorageErrorCode | undefined {
  if (name === undefined) {
    return undefined;
  }
  if (NOT_FOUND_NAMES.has(name)) {
    return 'OBJECT_NOT_FOUND';
  }
  if (ACCESS_DENIED_NAMES.has(name)) {
    return 'ACCESS_DENIED';
  }
  if (CONFLICT_NAMES.has(name)) {
    return 'CONFLICT';
  }
  if (ABORT_NAMES.has(name)) {
    return 'REQUEST_ABORTED';
  }
  if (TIMEOUT_NAMES.has(name)) {
    return 'PROVIDER_TIMEOUT';
  }
  if (UNAVAILABLE_NAMES.has(name)) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return undefined;
}

/**
 * Maps an SDK/driver failure onto the closed taxonomy.
 *
 * Name and error-code fields are checked before the HTTP status because a
 * provider may return a generic status for a specific condition; anything
 * unrecognised becomes `INVALID_PROVIDER_RESPONSE` rather than being guessed
 * into a retryable class, so an unknown failure is never silently retried.
 */
export function classifyProviderError(error: unknown): ObjectStorageErrorCode {
  const byName =
    classifyByName(readString(error, 'name')) ?? classifyByName(readString(error, 'code'));
  if (byName !== undefined) {
    return byName;
  }
  const status = readHttpStatus(error);
  if (status !== undefined) {
    const match = HTTP_STATUS_CODES.find(([code]) => code === status);
    if (match !== undefined) {
      return match[1];
    }
  }
  return 'INVALID_PROVIDER_RESPONSE';
}

/**
 * Wraps a provider failure in a safe, operation-scoped `ObjectStorageError`.
 *
 * The message names only the operation and the classification — never the
 * endpoint, credentials, bucket contents or the raw SDK message.
 */
/**
 * Wraps a provider failure as a classified storage error.
 *
 * `operation` names the **kind** of call and never its object key.
 * `APP12-H04-C1` §7 found the key in an API error log — a bounded storage
 * deadline turns a hang into a logged error, so a message that had always
 * carried the key started reaching the log pipeline. Nothing diagnostic is
 * lost: the request id, route and business id are already on the same line, and
 * they identify the object without publishing its storage path.
 */
export function toObjectStorageError(operation: string, error: unknown): ObjectStorageError {
  if (error instanceof ObjectStorageError) {
    return error;
  }
  const code = classifyProviderError(error);
  return new ObjectStorageError(code, `Object storage ${operation} failed (${code}).`, {
    cause: error,
  });
}
