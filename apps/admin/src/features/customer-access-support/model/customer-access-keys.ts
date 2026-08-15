/**
 * TanStack query identities for the customer-access support screen.
 *
 * Three server facts live in the cache — the Customer, their grants and the
 * notifications bound to them — and every one of them is keyed by the resolved
 * Customer id. That is what makes the invalidations after a revoke or a replay
 * *narrow*: `grants(customerId)` and `notifications(customerId)` name exactly the
 * queries the write affected, so nothing else in the Admin cache is touched.
 *
 * The lookup itself has **no key**. Resolving a contact is a mutation, not a
 * query: caching it would mean holding a mapping from a real person's address to
 * their Customer id in browser memory for as long as the tab lives, and keying it
 * would put that address in a devtools panel. The contact is submitted, the id
 * comes back, and the value is gone.
 */
const ROOT = ['admin', 'customer-access-support'] as const;

export const customerAccessKeys = {
  root: ROOT,
  customer: (customerId: string) => [...ROOT, 'customer', customerId] as const,
  grants: (customerId: string) => [...ROOT, 'grants', customerId] as const,
  notifications: (customerId: string) => [...ROOT, 'notifications', customerId] as const,
} as const;
