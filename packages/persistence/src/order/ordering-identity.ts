/**
 * The two Ordering identities the AGG-15 contract needs (`APP7-W01-C1`).
 *
 * Both were declared on `CustomRequestRepository` in `apps/api`, which is still
 * their conceptual owner — the request aggregate, not the order. They move here
 * for one reason only: `OrderRepository` names them, and after `APP7-W01-C1` the
 * Order contract is shared by two applications, so a type it references may not
 * live inside one of them.
 *
 * `custom-request.repository.ts` re-exports both, so the API's request contract
 * still publishes them under their delivered names and every existing import is
 * unchanged. There is exactly one declaration.
 *
 * Nothing else about the Custom Request aggregate moved, and nothing else may:
 * AGG-13 is written by the API alone.
 */

/** COL-TBL037-01. Branded so a bare string cannot be passed as a request id. */
export type CustomRequestId = string & { readonly __brand: 'CustomRequestId' };

/**
 * Who caused a transition.
 *
 * The shape mirrors the schema's actor CHECK: exactly one of the three actor
 * references must be present, matching `actorKind`.
 */
export type RequestActor =
  | { readonly kind: 'ADMIN'; readonly adminId: string }
  | { readonly kind: 'CUSTOMER'; readonly customerId: string; readonly grantId: string }
  | { readonly kind: 'SYSTEM'; readonly systemJobKey: string };
