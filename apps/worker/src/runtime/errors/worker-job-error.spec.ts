import {
  WORKER_ERROR_CLASSES,
  WorkerJobError,
  classifyHandlerError,
  dispositionOf,
  isWorkerErrorClass,
} from './worker-job-error';

const MAX_ATTEMPTS = 3;

describe('worker error taxonomy', () => {
  it('is the closed set the decision locked', () => {
    expect([...WORKER_ERROR_CLASSES]).toEqual([
      'JOB_PAYLOAD_INVALID',
      'JOB_SCHEMA_UNSUPPORTED',
      'JOB_HANDLER_TIMEOUT',
      'JOB_DEPENDENCY_UNAVAILABLE',
      'JOB_TRANSIENT_FAILURE',
      'JOB_INVARIANT_VIOLATION',
      'JOB_UNKNOWN_FAILURE',
      'STALE_JOB_LEASE',
      'WORKER_LEASE_EXPIRED',
    ]);
  });

  it('rejects anything outside the set', () => {
    expect(isWorkerErrorClass('JOB_PAYLOAD_INVALID')).toBe(true);
    expect(isWorkerErrorClass('SOMETHING_ELSE')).toBe(false);
  });

  describe('classification', () => {
    it('keeps a class a handler chose deliberately', () => {
      const error = new WorkerJobError('JOB_DEPENDENCY_UNAVAILABLE', 'S3 unreachable');

      expect(classifyHandlerError(error)).toBe('JOB_DEPENDENCY_UNAVAILABLE');
    });

    it.each([
      new Error('boom'),
      new TypeError('undefined is not a function'),
      'a thrown string',
      undefined,
      null,
      { code: 'ECONNRESET' },
    ])('maps an unrecognised throw (%p) to JOB_UNKNOWN_FAILURE', (thrown) => {
      expect(classifyHandlerError(thrown)).toBe('JOB_UNKNOWN_FAILURE');
    });

    it('never lets a handler claim a runtime-only class', () => {
      // A handler that returned STALE_JOB_LEASE would make the runtime believe
      // the lease guard had already spoken.
      expect(classifyHandlerError(new WorkerJobError('STALE_JOB_LEASE', 'x'))).toBe(
        'JOB_UNKNOWN_FAILURE',
      );
      expect(classifyHandlerError(new WorkerJobError('WORKER_LEASE_EXPIRED', 'x'))).toBe(
        'JOB_UNKNOWN_FAILURE',
      );
    });

    it('does not read the message to decide the class', () => {
      const misleading = new Error('JOB_PAYLOAD_INVALID: not really');

      expect(classifyHandlerError(misleading)).toBe('JOB_UNKNOWN_FAILURE');
    });
  });

  describe('disposition', () => {
    it.each(['JOB_PAYLOAD_INVALID', 'JOB_SCHEMA_UNSUPPORTED', 'JOB_INVARIANT_VIOLATION'] as const)(
      '%s is terminal on the very first attempt',
      (errorClass) => {
        expect(dispositionOf(errorClass, 1, MAX_ATTEMPTS)).toBe('TERMINAL');
      },
    );

    it.each([
      'JOB_HANDLER_TIMEOUT',
      'JOB_DEPENDENCY_UNAVAILABLE',
      'JOB_TRANSIENT_FAILURE',
      'JOB_UNKNOWN_FAILURE',
    ] as const)('%s retries below the cap and terminates at it', (errorClass) => {
      expect(dispositionOf(errorClass, 1, MAX_ATTEMPTS)).toBe('RETRYABLE');
      expect(dispositionOf(errorClass, 2, MAX_ATTEMPTS)).toBe('RETRYABLE');
      expect(dispositionOf(errorClass, 3, MAX_ATTEMPTS)).toBe('TERMINAL');
      expect(dispositionOf(errorClass, 4, MAX_ATTEMPTS)).toBe('TERMINAL');
    });
  });

  it('keeps the message in memory but never in the class', () => {
    const error = new WorkerJobError('JOB_TRANSIENT_FAILURE', 'token=abc123 failed', {
      cause: new Error('root'),
    });

    expect(error.errorClass).toBe('JOB_TRANSIENT_FAILURE');
    expect(error.message).toContain('token=abc123');
    expect(error.cause).toBeInstanceOf(Error);
  });
});
