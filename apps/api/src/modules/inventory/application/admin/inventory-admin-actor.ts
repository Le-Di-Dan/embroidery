/**
 * The operator behind an Admin stock operation (`APP8-B01` §8).
 *
 * One function, in one file, used by the adjustment — so "the Admin id is
 * server-derived" is a single statement that can be read rather than a habit
 * repeated at each call site. It is the same arrangement `payment-admin-actor.ts`
 * established for APP7 and `moderation-actor.ts` for APP5, and it is
 * deliberately a copy of that shape rather than an import of it: a Payment
 * authority is not an Inventory authority, and coupling the stock path to
 * another module's application layer for four lines would be the cross-module
 * reach `BACKEND_CONVENTIONS.md` §10 exists to prevent.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie
 * before the handler runs, and this reads it back. It accepts no parameter
 * beyond the context service: there is no argument through which a controller,
 * a body or a header could supply an identity. That matters here because
 * `inventory_ledger_entries.admin_id` is evidence with **no FK** (DB4: "actor
 * evidence is exactly that — DB4 models no REL row for it"), so nothing in the
 * database would reject a fabricated id and the application is the whole of its
 * integrity.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to this use case is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal
 * that would make the fault look like an ordinary rejection.
 */
import type { RequestContextService } from '../../../../platform/request-context/request-context.service';

export class InventoryAdminActorRequiredError extends Error {
  constructor(kind: string) {
    super(`An Admin stock operation requires an ADMIN actor; the bound actor is ${kind}.`);
    this.name = 'InventoryAdminActorRequiredError';
  }
}

export function requireInventoryAdminActorId(requestContext: RequestContextService): string {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new InventoryAdminActorRequiredError(actor.kind);
  }
  return actor.adminId;
}
