/**
 * Transport policy for the Admin notification list (`APP4-B08` §27).
 *
 * `no-store`, and it is not negotiable.
 *
 * The list carries other people's masked destinations and the delivery state of
 * their credentials. Both reasons the codebase already uses `no-store` for an
 * authenticated private read apply at once: a shared cache must never hold one
 * operator's view of a customer's notifications, and a private cache must not
 * outlive the replay the operator just performed — a cached page still showing
 * `FAILED` with no replay beside it is the wrong answer to the only question the
 * screen exists to answer.
 *
 * Declared here rather than imported from the customer module's B07 policy:
 * they are the same string for the same reason, but a cross-context import for
 * one constant would couple two Admin surfaces that share nothing else.
 */
export const ADMIN_NOTIFICATION_CACHE_CONTROL = 'no-store' as const;
