/**
 * The operator behind an Admin production operation (`APP8-B03` §5.1, §10).
 *
 * One function, in one file, so "production job creation is Admin-initiated"
 * (`PO-APP8-003`) is a single statement that can be read rather than a habit
 * repeated at each call site. It is the same arrangement `inventory-admin-actor.ts`
 * established for `APP8-B01`, `payment-admin-actor.ts` for APP7 and
 * `moderation-actor.ts` for APP5, and it is deliberately a copy of that shape
 * rather than an import of one: an Inventory authority is not a Production
 * authority, and coupling this path to another module's application layer for
 * four lines would be the cross-module reach `BACKEND_CONVENTIONS.md` §10 exists
 * to prevent.
 *
 * `AuthenticatedAdminGuard` binds the ADMIN actor from the session cookie before
 * the handler runs, and this reads it back. It accepts no parameter beyond the
 * context service: there is no argument through which a controller, a body or a
 * header could supply an identity.
 *
 * ### It asserts; it does not return an id, because nothing stores one
 *
 * The delivered `createJob` writes `production_jobs` and
 * `production_specifications`, and neither table has an actor column — LC-18's
 * actor evidence lives on `production_job_transitions`, which only a
 * *transition* appends, and `(create)→PLANNED` is not one of LC-18's transition
 * rows. `DB3_AUDIT_SPECIFICATION.md` likewise scopes its production row to
 * *"Production start/complete/cancel(rework) | TR-LC18-\*"*, so B03 mints no
 * audit action of its own (§14, §19).
 *
 * Returning an id nobody persists would suggest the creator is recorded. It is
 * not, and `APP8-B03-COMPLETION-REPORT.md` routes that as a nonblocking finding
 * to the checkpoint that owns production transitions. What this function does
 * enforce is real: the actor reaching a creation path is an ADMIN.
 *
 * A non-ADMIN bound actor is a wiring fault, not a client error: the only route
 * to this use case is behind the Admin guard, so anything else means the guard
 * was removed or a second one was added. It fails loudly and travels to the
 * platform filter as a sanitised 500 rather than being shaped into a refusal
 * that would make the fault look like an ordinary rejection.
 */
import type { RequestContextService } from '../../../../platform/request-context/request-context.service';

export class ProductionAdminActorRequiredError extends Error {
  constructor(kind: string) {
    super(`An Admin production operation requires an ADMIN actor; the bound actor is ${kind}.`);
    this.name = 'ProductionAdminActorRequiredError';
  }
}

export function assertProductionAdminActor(requestContext: RequestContextService): void {
  const actor = requestContext.requireAuthenticatedActor();
  if (actor.kind !== 'ADMIN') {
    throw new ProductionAdminActorRequiredError(actor.kind);
  }
}
