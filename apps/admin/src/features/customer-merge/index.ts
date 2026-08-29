// Public surface of the customer-merge feature (`APP10-A02`). The two route
// files import their screen from here; components, hooks, services and model
// stay encapsulated.
//
// The three mutations are deliberately **not** on this boundary. Opening a case
// names two identifiable people, rejecting one closes it permanently, and
// executing one moves live ownership and revokes access irreversibly. Anything
// that could reach them from outside this feature would be an irreversible
// command with no approved confirmation behind it. They are reached through the
// approved screens or not at all.
//
// The route helpers cross so a link to a case is spelled once. There is no merge
// *list* route to publish, because there is no list operation and no list
// screen — a case is reached from the open that created it, or from its own id.
export { MergeSelectionScreen } from './components/merge-selection-screen';
export { MergeCaseScreen } from './components/merge-case-screen';
export {
  ADMIN_CUSTOMER_MERGE_ROUTE,
  adminCustomerMergeCaseRoute,
} from './model/customer-merge-route';
export { CUSTOMER_MERGE_COPY } from './model/customer-merge-copy';
