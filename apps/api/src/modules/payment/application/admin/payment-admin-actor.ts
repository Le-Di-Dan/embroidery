/**
 * The operator behind an Admin payment decision (`APP7-B04` §6).
 *
 * One function, in one file, used by both mutations — so "the Admin id is
 * server-derived" is a single statement that can be read rather than a habit
 * repeated twice. It is the same arrangement `moderation-actor.ts` established
 * for APP5, and it is deliberately a copy of that shape rather than an import of
 * it: an Ordering moderation helper is not a Payment authority, and coupling a
 * money path to another module's application layer for four lines would be the
 * cross-module reach `BACKEND_CONVENTIONS.md` §10 exists to prevent.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie before
 * either handler runs, and this reads it back. It accepts no parameter beyond
 * the context service: there is no argument through which a caller — a
 * controller, a body, a header — could supply an identity, which is what makes
 * the derivation server-side rather than merely server-preferred. That matters
 * more here than anywhere else in the repository, because
 * `payment_reconciliations.admin_id` is the DEV-DB6-015 **no-FK** evidence
 * column: nothing in the database would reject a fabricated id, so the
 * application is the whole of its integrity.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to these use cases is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal
 * that would make an unauthenticated caller look merely malformed.
 */
import type { RequestContextService } from '../../../../platform/request-context/request-context.service';

export class PaymentAdminActorRequiredError extends Error {
  constructor(kind: string) {
    super(`An Admin payment decision requires an ADMIN actor; the bound actor is ${kind}.`);
    this.name = 'PaymentAdminActorRequiredError';
  }
}

export function requirePaymentAdminActorId(requestContext: RequestContextService): string {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new PaymentAdminActorRequiredError(actor.kind);
  }
  return actor.adminId;
}
