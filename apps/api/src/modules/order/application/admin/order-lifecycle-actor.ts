/**
 * The operator behind an Admin order lifecycle command (`APP9-B01` §5).
 *
 * One function, in one file, so "the Admin id is server-derived" is a single
 * statement that can be read rather than a habit repeated at each call site. It
 * is the same arrangement `moderation-actor.ts` established for `APP5-B05`,
 * `payment-admin-actor.ts` for APP7 and `production-admin-actor.ts` for APP8,
 * and it is deliberately a copy of that shape rather than an import of one: a
 * Custom Request moderation authority is not an Order lifecycle authority, and a
 * `TR-LC14-05` command borrowing AGG-13's actor rule for four lines would tie
 * two aggregates' authorization together for a saving nobody asked for.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie before
 * the handler runs, and this reads it back. It accepts no parameter beyond the
 * context service: there is no argument through which a controller, a body or a
 * header could supply an identity.
 *
 * It returns the id because the id is **stored**: `order_transitions` carries
 * `actor_kind` and `admin_id`, and those columns are LC-14's actor evidence.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to this use case is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal
 * that would make the fault look like an ordinary rejection.
 */
import type { RequestContextService } from '../../../../platform/request-context/request-context.service';

export class OrderLifecycleActorRequiredError extends Error {
  constructor(kind: string) {
    super(`An Admin order lifecycle command requires an ADMIN actor; the bound actor is ${kind}.`);
    this.name = 'OrderLifecycleActorRequiredError';
  }
}

export function requireOrderLifecycleAdminId(requestContext: RequestContextService): string {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new OrderLifecycleActorRequiredError(actor.kind);
  }
  return actor.adminId;
}
