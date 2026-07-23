import type { RequestActor } from '../actor-context/request-actor';
import type { LogActorView } from './log-record';

/**
 * Projects a request actor onto the safe view a log record may carry (APP0-B05).
 *
 * Only the actor kind and its canonical audit reference are logged. Those
 * identifiers (`admin_accounts.id`, `customers.id`, the system job key) are the
 * same references the audit trail records, not contact data: no email, phone,
 * role claim, token, session or provider payload exists on the actor model to
 * begin with, and the customer's secure-access `grantId` is deliberately omitted
 * because it is authorisation evidence, not identity, and logging it by default
 * is not justified by the security docs. Anonymous logs its kind and nothing
 * else.
 */
export function toActorLogView(actor: RequestActor): LogActorView {
  switch (actor.kind) {
    case 'ADMIN':
      return { kind: 'ADMIN', id: actor.adminId };
    case 'CUSTOMER':
      return { kind: 'CUSTOMER', id: actor.customerId };
    case 'SYSTEM':
      return { kind: 'SYSTEM', id: actor.systemJobKey };
    case 'ANONYMOUS':
      return { kind: 'ANONYMOUS' };
  }
}
