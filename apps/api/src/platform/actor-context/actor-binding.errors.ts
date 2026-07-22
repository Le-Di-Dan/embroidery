import type { RequestActorKind } from './request-actor';

/**
 * Thrown when a request tries to bind an actor twice (APP0-B04).
 *
 * Rebinding is refused rather than allowed to win, because the second write
 * would silently change who every later audit record in the same request names.
 * The message states the kinds only — an identifier could be a customer or admin
 * reference and does not belong in an error a client might see mapped.
 */
export class ActorAlreadyBoundError extends Error {
  constructor(boundKind: RequestActorKind, attemptedKind: RequestActorKind) {
    super(
      `An actor of kind ${boundKind} is already bound to this request; ` +
        `refusing to rebind as ${attemptedKind}. Bind exactly once, in the ` +
        'authentication layer.',
    );
    this.name = 'ActorAlreadyBoundError';
  }
}

/** Thrown when code that requires an established identity runs anonymously. */
export class AuthenticatedActorRequiredError extends Error {
  constructor() {
    super('This operation requires an authenticated actor; the request is anonymous.');
    this.name = 'AuthenticatedActorRequiredError';
  }
}
