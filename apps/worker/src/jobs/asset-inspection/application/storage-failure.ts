/**
 * Infrastructure failure classification (APP2-W01 §17).
 *
 * The distinction this file draws is the one the whole checkpoint turns on: a
 * failure caused by *the file* is a business rejection written once and
 * terminally, while a failure caused by *the infrastructure* is retryable and
 * belongs to the I02 runtime's backoff. Confusing the two either dead-letters a
 * healthy asset because MinIO blinked, or retries a corrupt PNG five times
 * before rejecting it anyway.
 *
 * Nothing here inspects an error message. Classification comes from the closed
 * `ObjectStorageError` taxonomy the storage package already produces, and an
 * unrecognised failure becomes `JOB_TRANSIENT_FAILURE` — retryable before the
 * cap, terminal at it, so an unknown fault can neither loop forever nor be
 * mistaken for a verdict about the image.
 */
import { ObjectStorageError } from '@embroidery/object-storage';

import { WorkerJobError } from '../../../runtime/errors/worker-job-error';

/**
 * Wraps an infrastructure failure as a retryable worker error.
 *
 * `operation` is a fixed identifier from this module — never a key, a bucket or
 * a provider message.
 */
export function toRetryableFailure(operation: string, error: unknown): WorkerJobError {
  if (error instanceof WorkerJobError) {
    return error;
  }
  if (error instanceof ObjectStorageError) {
    switch (error.code) {
      case 'PROVIDER_UNAVAILABLE':
      case 'PROVIDER_TIMEOUT':
      case 'ACCESS_DENIED':
      case 'OBJECT_NOT_FOUND':
      case 'CONFLICT':
      case 'INVALID_PROVIDER_RESPONSE':
        // All of these are conditions of the *store*, not of the image. Even
        // `OBJECT_NOT_FOUND` is: the row says the original exists, so a store
        // that cannot serve it is either lagging or broken, and inventing a
        // rejection code for it would record a verdict about a file nobody
        // read.
        return new WorkerJobError(
          'JOB_DEPENDENCY_UNAVAILABLE',
          `Object storage ${operation} failed (${error.code}).`,
        );
      case 'REQUEST_ABORTED':
        return new WorkerJobError('JOB_HANDLER_TIMEOUT', `Object storage ${operation} aborted.`);
    }
  }
  return new WorkerJobError('JOB_TRANSIENT_FAILURE', `Asset processing ${operation} failed.`);
}

/** True when the attempt's own deadline fired, whatever surfaced first. */
export function isAbort(signal: AbortSignal, error: unknown): boolean {
  if (signal.aborted) {
    return true;
  }
  return error instanceof ObjectStorageError && error.code === 'REQUEST_ABORTED';
}

/** The abort a timed-out attempt reports, so the runtime sees its own timeout. */
export function abortFailure(operation: string): WorkerJobError {
  return new WorkerJobError('JOB_HANDLER_TIMEOUT', `Asset processing ${operation} was aborted.`);
}
