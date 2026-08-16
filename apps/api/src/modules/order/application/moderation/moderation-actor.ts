/**
 * The operator behind a moderation action (`APP5-B05` §8).
 *
 * One function, in one file, used by both moderation use cases — so "the Admin
 * id is server-derived" is a single statement that can be read rather than a
 * habit repeated twice.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie before
 * either handler runs, and this reads it back. It accepts no parameter beyond
 * the context service: there is no argument through which a caller — a
 * controller, a body, a header — could supply an identity, which is what makes
 * the derivation server-side rather than merely server-preferred.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to these use cases is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal
 * that would make an unauthenticated caller look merely malformed.
 */
import type { RequestContextService } from '../../../../platform/request-context/request-context.service';

export class ModerationActorRequiredError extends Error {
  constructor(kind: string) {
    super(
      `A custom-request moderation action requires an ADMIN actor; the bound actor is ${kind}.`,
    );
    this.name = 'ModerationActorRequiredError';
  }
}

export function requireAdminActorId(requestContext: RequestContextService): string {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new ModerationActorRequiredError(actor.kind);
  }
  return actor.adminId;
}
