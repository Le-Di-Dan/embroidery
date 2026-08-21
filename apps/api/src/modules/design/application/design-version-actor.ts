/**
 * The operator behind a design-version authoring action (`APP6-B08` §13).
 *
 * One function, in one file, so "the Admin id is server-derived" is a single
 * statement that can be read rather than a habit repeated at each call site. It
 * follows `APP6-B01`'s `quotation-actor.ts`, restated here rather than imported
 * because that one belongs to CTX-QUO and this to CTX-DSN.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie before
 * the handler runs, and this reads it back. It accepts no parameter beyond the
 * context service: there is no argument through which a caller — a controller, a
 * body, a header — could supply an identity, which is what makes the derivation
 * server-side rather than merely server-preferred.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to this use case is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal that
 * would make an unauthenticated caller look merely malformed.
 */
import type { RequestContextService } from '../../../platform/request-context/request-context.service';

export class DesignVersionActorRequiredError extends Error {
  constructor(kind: string) {
    super(`Design version authoring requires an ADMIN actor; the bound actor is ${kind}.`);
    this.name = 'DesignVersionActorRequiredError';
  }
}

export function requireAdminActorId(requestContext: RequestContextService): string {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new DesignVersionActorRequiredError(actor.kind);
  }
  return actor.adminId;
}
