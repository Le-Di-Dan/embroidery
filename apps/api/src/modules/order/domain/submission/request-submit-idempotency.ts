/**
 * The `request.submit` idempotency contract, as constants
 * (`APP5-G01` §4, `ADR-DB1-017`, GRD-012/GRD-030).
 *
 * The namespace is a constant and not a free string (`ADR-DB1-017` r1), and the
 * scope key is the **verified `SUBMISSION`-purpose challenge id** (`G01-D01`).
 * There is no client-supplied idempotency key and none is accepted:
 *
 * - the challenge is **server-issued** by `POST /api/public/verification/challenges`;
 * - it is **universal** — GRD-001 makes a verified `SUBMISSION` challenge a
 *   precondition of *every* submission, on both branches, where the DB3 spec's
 *   "session-bound" anchor cannot be (the COP branch has no session);
 * - it is **naturally one-to-one with a submission** — challenges are terminal
 *   after `VERIFIED` and hard-TTL-deleted, so a second request requires a fresh
 *   verification, which is the intended business rule rather than a limitation;
 * - it is **bounded** — issuance is rate-limited by GRD-026 and every challenge
 *   carries `expires_at`.
 */

/** `ADR-DB1-017` r1 — the operation family, never assembled from request data. */
export const REQUEST_SUBMIT_NAMESPACE = 'request.submit';

/**
 * The claim lease.
 *
 * DB3 files `request.submit` under the **medium (`submission`)** TTL class and
 * records that *"TTL class values = policy config (deferred, CON-144)"* — no
 * policy row exists to read, so this is the class rendered as a number, in the
 * same shape `asset-intake.policy.ts` uses for its own allocation lease. It
 * bounds only how long a *stuck* `IN_PROGRESS` claim blocks a genuine retry;
 * every successful submission completes its record inside one transaction, so no
 * ordinary path ever waits on it. When CON-144 publishes the class values this
 * constant is replaced by that read, not re-decided.
 */
export const SUBMISSION_IDEMPOTENCY_TTL_MS = 86_400_000;

/**
 * How many times a code collision may be re-drawn (`APP5-G01` §5).
 *
 * `uq_custom_requests__code` is the arbiter, and a `23505` aborts the whole
 * PostgreSQL transaction — so a retry is a retry of the **transaction**, not of
 * the insert. At ~49 bits of entropy a single collision is already a
 * once-in-many-lifetimes event and a second is not reachable in practice; the
 * bound exists so a defect in the generator surfaces as a bounded failure
 * instead of an unbounded loop.
 */
export const MAX_REQUEST_CODE_ATTEMPTS = 3;
