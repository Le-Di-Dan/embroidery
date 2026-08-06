/**
 * The request-scoped result of a successful Session authorization
 * (`APP3-B06A`, `IMP-D048` PO-03).
 *
 * What is *absent* is the contract. No raw secret, no digest, no pepper, no
 * cookie header, no storage identity and no customer identity ever reaches a
 * handler: a downstream mutation needs to know **which** session is authorized
 * and **at what revision**, and nothing else. Anything more would be one
 * careless log line away from disclosure.
 *
 * The context is attached to the request object by the guard, so the work is
 * done once per request no matter how many handlers or interceptors read it.
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** The property the guard attaches under. Not a public API. */
export const DESIGN_SESSION_CONTEXT_KEY = '__designSessionContext';

export interface DesignSessionContext {
  /** The public Session id. Safe to log; it is already in the path. */
  readonly designSessionId: string;
  /** The revision observed at authorization — the value a CAS must present. */
  readonly currentRevision: number;
  /** When authorization succeeded, for a downstream `last_activity_at`. */
  readonly authorizedAt: Date;
}

interface ContextCarryingRequest {
  [DESIGN_SESSION_CONTEXT_KEY]?: DesignSessionContext;
}

export function attachDesignSessionContext(request: object, context: DesignSessionContext): void {
  (request as ContextCarryingRequest)[DESIGN_SESSION_CONTEXT_KEY] = context;
}

export function readDesignSessionContext(request: object): DesignSessionContext | undefined {
  return (request as ContextCarryingRequest)[DESIGN_SESSION_CONTEXT_KEY];
}

/**
 * Injects the authorized Session context into a handler.
 *
 * Throws when absent rather than returning `undefined`: reaching a handler
 * without it means the guard was not applied, and a handler that silently
 * proceeded would be an unauthenticated mutation.
 */
export const CurrentDesignSession = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): DesignSessionContext => {
    const request = executionContext.switchToHttp().getRequest<object>();
    const context = readDesignSessionContext(request);
    if (context === undefined) {
      throw new Error(
        'No authorized design session on the request: apply DesignSessionGuard to this route.',
      );
    }
    return context;
  },
);
