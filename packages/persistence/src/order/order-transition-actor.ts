/**
 * The `order_transitions` actor columns for one bound actor (COL-TBL045-05).
 *
 * One mapping, in one file, because two writers append to that table: the
 * aggregate's own `transition` and the dispatch transaction, which appends its
 * `SHIPPING_FREEZE` row inside `DrizzleOrderShippingRepository`. LC-14's actor
 * evidence is the `actor_kind`/`admin_id`/`customer_id`/`grant_id`/
 * `system_job_key` set, and two spellings of *who did this* on one table is how
 * an audit trail starts disagreeing with itself.
 *
 * It lives beside the two repositories rather than inside either, so neither
 * has to import the other for four lines.
 */
import type { RequestActor } from './ordering-identity';

export function actorColumns(actor: RequestActor) {
  switch (actor.kind) {
    case 'ADMIN':
      return { actorKind: 'ADMIN', adminId: actor.adminId };
    case 'CUSTOMER':
      return { actorKind: 'CUSTOMER', customerId: actor.customerId, grantId: actor.grantId };
    case 'SYSTEM':
      return { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
  }
}
