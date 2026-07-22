import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

import {
  ActorAlreadyBoundError,
  AuthenticatedActorRequiredError,
} from '../actor-context/actor-binding.errors';
import {
  ANONYMOUS_ACTOR,
  isAuthenticatedActor,
  sanitizeAuthenticatedActor,
  type AuthenticatedRequestActor,
  type RequestActor,
} from '../actor-context/request-actor';

/**
 * Everything the application may correlate by for the lifetime of one request.
 *
 * APP0-B02 owns exactly one field, and it stays that way: what a caller may
 * *open* a context with is still only the request ID. The actor added by
 * APP0-B04 is not part of this input shape — it is bound later, once, through
 * `bindActor()`, because it is not known when the middleware runs. Logging
 * fields (B05) remain absent: this must not become a general-purpose mutable
 * request dictionary that every later checkpoint bolts another property onto.
 */
export interface RequestContext {
  readonly requestId: string;
}

/**
 * The private store behind one active context.
 *
 * `boundActor` is the only mutable slot in the platform and it is never handed
 * out: `get()` returns a projection, so no caller can reach the slot through a
 * reference and overwrite the actor behind the binding rules.
 */
interface RequestContextStore {
  readonly requestId: string;
  boundActor: AuthenticatedRequestActor | undefined;
}

/** Thrown when code that requires correlation runs outside a request. */
export class RequestContextUnavailableError extends Error {
  constructor() {
    super(
      'No request context is active. The required accessors and actor binding ' +
        'may only be used within an HTTP request handled by RequestIdMiddleware.',
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
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  /**
   * Runs `callback` with `context` active for its entire async continuation.
   *
   * `run()` is used instead of `enterWith()` on purpose: `run()` scopes the
   * context to this call tree and restores the previous one on exit, so a
   * context can never leak into an unrelated request sharing the event loop.
   * `enterWith()` mutates the current execution context with no such boundary.
   */
  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run({ requestId: context.requestId, boundActor: undefined }, callback);
  }

  /**
   * The active context, or `undefined` outside a request.
   *
   * A frozen projection rather than the store itself, so the actor slot cannot
   * be reached — let alone written — through the value this returns.
   */
  get(): RequestContext | undefined {
    const store = this.storage.getStore();
    return store === undefined ? undefined : Object.freeze({ requestId: store.requestId });
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

  /**
   * Binds the actor for this request, exactly once (APP0-B04).
   *
   * The intended caller is the authentication layer APP1 adds: the middleware
   * opens the context with a request ID, that layer validates whatever
   * credential the selected provider uses and calls this with the result, and
   * everything downstream — use cases, audit metadata — reads it. B04 provides
   * the seam and nothing that decides identity.
   *
   * The actor is rebuilt through its factory before it is stored, so the caller
   * cannot mutate the bound value afterwards and no extra field it may have
   * carried (a token, a claim set, contact details) is retained. Anonymous
   * cannot be bound: it is the absence of a binding, and treating it as one
   * would consume the single bind a real actor still needs.
   */
  bindActor(actor: AuthenticatedRequestActor): void {
    const store = this.storage.getStore();
    if (store === undefined) {
      throw new RequestContextUnavailableError();
    }
    const sanitized = sanitizeAuthenticatedActor(actor);
    if (store.boundActor !== undefined) {
      throw new ActorAlreadyBoundError(store.boundActor.kind, sanitized.kind);
    }
    store.boundActor = sanitized;
  }

  /**
   * The actor this request acts as, or `undefined` outside a request.
   *
   * Unbound means anonymous, not missing: an HTTP request that has not been
   * authenticated is a legitimate, fully described state and callers should not
   * have to special-case `undefined` for it.
   */
  getActor(): RequestActor | undefined {
    const store = this.storage.getStore();
    return store === undefined ? undefined : (store.boundActor ?? ANONYMOUS_ACTOR);
  }

  /** The bound actor, or `undefined` when nothing has been bound (or no request). */
  getBoundActor(): AuthenticatedRequestActor | undefined {
    return this.storage.getStore()?.boundActor;
  }

  /** The actor this request acts as, failing loudly outside a request. */
  requireActor(): RequestActor {
    const store = this.storage.getStore();
    if (store === undefined) {
      throw new RequestContextUnavailableError();
    }
    return store.boundActor ?? ANONYMOUS_ACTOR;
  }

  /**
   * The actor, refusing anonymity.
   *
   * This is a precondition check for code that has nothing to record or attribute
   * without an identity. It is not an authorization decision: it says an actor
   * exists, never that the actor may do the thing.
   */
  requireAuthenticatedActor(): AuthenticatedRequestActor {
    const actor = this.requireActor();
    if (!isAuthenticatedActor(actor)) {
      throw new AuthenticatedActorRequiredError();
    }
    return actor;
  }
}
