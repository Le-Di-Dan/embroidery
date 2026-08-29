// Public surface of the customer-access support feature. The route file and the
// Admin shell navigation import from here only; components, hooks, services and
// model stay encapsulated.
export { CustomerAccessScreen } from './components/customer-access-screen';
export { ADMIN_CUSTOMER_ACCESS_ROUTE } from './model/customer-access-route';
export { CUSTOMER_ACCESS_COPY } from './model/customer-access-copy';

// The exact-contact resolution seam, published for `APP10-A02`.
//
// The merge workflow resolves both of its participants the only way this
// product resolves a Customer at all, and it does so **through this boundary**
// rather than by reaching into `services/` or re-implementing the call. That
// keeps one authority for the rule that matters: the contact travels in a
// request body, is never returned, stored, logged or put in a query key, and the
// only thing that leaves is an opaque Customer id.
//
// `customerAccessKeys` and `fetchCustomerDetail` cross with it so a Customer read
// by the merge screen and the same Customer read by the support screen are one
// cached entry, not two that can disagree. `classifyLookupFailure` crosses so a
// failed lookup means the same thing on both screens — in particular that a
// 404 and a 400 are one indistinguishable "no match", which is the enumeration
// oracle the API refuses to be.
//
// The mutations stay off this boundary. Nothing outside this feature may revoke
// a grant, replay a notification, patch a profile or retire a contact.
export { resolveCustomerByContact, fetchCustomerDetail } from './services/customer-access.service';
export { customerAccessKeys } from './model/customer-access-keys';
export {
  classifyLookupFailure,
  isCustomerAccessApiError,
  CustomerAccessApiError,
  type LookupFailure,
} from './model/customer-access-failure';
