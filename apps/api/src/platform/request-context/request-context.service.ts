import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/**
 * Everything the application may correlate by for the lifetime of one request.
 *
 * APP0-B02 owns exactly one field. Actor identity (B04), audit metadata (B04)
 * and logging fields (B05) are deliberately absent: this must not become a
 * general-purpose mutable request dictionary that every later checkpoint bolts
 * another property onto.
 */
export interface RequestContext {
  readonly requestId: string;
}

/** Thrown when code that requires correlation runs outside a request. */
export class RequestContextUnavailableError extends Error {
  constructor() {
    super(
      'No request context is active. requireRequestId() may only be called ' +
        'within an HTTP request handled by RequestIdMiddleware.',
    );
    this.name = 'RequestContextUnavailableError';
  }
}

/**
 * Async-local request context (APP0-B02).
 *
 * Built on the Node core `AsyncLocalStorage` rather than a third-party CLS
 * package: it is the platform primitive those packages wrap, it adds no
 * dependency, and it propagates across `await` boundaries automatically.
 *
 * It is a plain singleton provider, not a request-scoped one. Marking the
 * context request-scoped would cascade request scope through every consumer's
 * dependency graph and force Nest to rebuild those providers on every request —
 * a large cost for reading one string.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /**
   * Runs `callback` with `context` active for its entire async continuation.
   *
   * `run()` is used instead of `enterWith()` on purpose: `run()` scopes the
   * context to this call tree and restores the previous one on exit, so a
   * context can never leak into an unrelated request sharing the event loop.
   * `enterWith()` mutates the current execution context with no such boundary.
   */
  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /** The active context, or `undefined` outside a request. */
  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /** The active request ID, or `undefined` outside a request. */
  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /**
   * The active request ID, failing loudly outside a request.
   *
   * It never invents an ID: a caller that silently received a fresh or
   * `"unknown"` id would produce logs and audit records that look correlated
   * but are not, which is worse than an explicit failure.
   */
  requireRequestId(): string {
    const store = this.storage.getStore();
    if (store === undefined) {
      throw new RequestContextUnavailableError();
    }
    return store.requestId;
  }
}
