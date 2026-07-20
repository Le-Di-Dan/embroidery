/**
 * Raised when a command that requires atomicity was called without a
 * transaction boundary (DB7-CP3).
 *
 * This is a **programming error**, not a persistence failure: the caller forgot
 * `TransactionManager.runInTransaction`. It lives here, beside the mapper,
 * because the mapper has to be able to recognise it and let it through
 * untouched — folding it into `UNKNOWN_PERSISTENCE_FAILURE` would replace the
 * one message that names the actual mistake with "the operation could not be
 * completed", and the bug would then be undiagnosable from a log.
 *
 * It carries no database detail, so nothing leaks if it does reach a client;
 * but it should reach a *developer*, in a test or at integration time.
 */
export class TransactionRequiredError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(
      `${operation} must run inside a transaction: ` +
        'wrap the call in TransactionManager.runInTransaction.',
    );
    this.name = 'TransactionRequiredError';
    this.operation = operation;
  }
}

export function isTransactionRequiredError(error: unknown): error is TransactionRequiredError {
  return error instanceof TransactionRequiredError;
}
