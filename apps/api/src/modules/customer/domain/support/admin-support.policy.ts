/**
 * Transport policy for the Admin support reads (`APP4-B07` §15).
 *
 * `no-store`, and it is not negotiable on either GET.
 *
 * These responses carry another person's masked contacts and the live state of
 * their access credentials. `no-store` is the established treatment for an
 * authenticated private read in this codebase — `GET /api/staff/me` sets it on
 * the Admin's own identity, and the Admin side-background route sets it on bytes
 * that may belong to an unpublished product — and both reasons apply here at
 * once: a shared cache must never hold one operator's view of a customer, and a
 * private cache must not outlive the revocation the operator just performed. A
 * cached grant list showing `ACTIVE` after a revoke is precisely the wrong
 * answer to the only question the screen exists to answer.
 *
 * `no-store` rather than `private, max-age=0`: the latter permits a private
 * cache to *write* the response and then revalidate, which still puts a
 * customer's contacts on disk.
 */
export const ADMIN_SUPPORT_CACHE_CONTROL = 'no-store' as const;
