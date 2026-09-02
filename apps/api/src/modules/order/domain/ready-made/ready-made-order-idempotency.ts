/**
 * The `readyMadeOrder.create` idempotency contract and the initial reservation
 * window, as constants (`BR-023`, `BR-025`, `ADR-DB1-017`, GRD-012/GRD-030).
 *
 * ## The scope key is the verified challenge id, not a client-minted key
 *
 * `APP5-G01` §4 settled this for `request.submit` and the argument is the same
 * one here, point for point:
 *
 * - the challenge is **server-issued** by `POST /api/public/verification/challenges`,
 *   so a client cannot choose a key that collides with somebody else's;
 * - it is **universal for this command** — `APP12-B02` §7 makes a verified
 *   contact a precondition of every Ready-Made order, so every call already has
 *   one and no second header has to be invented;
 * - it is **naturally one-to-one with an order**: challenges are terminal after
 *   `VERIFIED` and hard-TTL-deleted, so a second purchase requires a fresh
 *   verification. That is the intended business rule, not a limitation — and it
 *   is precisely what `APP12-B02` §22 asks for, because two legitimate
 *   purchases of the same SKU are two verifications and therefore two keys;
 * - it is **bounded** — issuance is rate-limited by GRD-026 and every challenge
 *   carries `expires_at`.
 *
 * It is emphatically **not** SKU + customer: that pair is stable across time and
 * would make a customer's second, deliberate purchase of the same item collide
 * with their first.
 *
 * ## Two namespaces over one challenge
 *
 * A verified `SUBMISSION` challenge can authorize a custom request under
 * `request.submit` and a Ready-Made order under the namespace below, because
 * `uq_idempotency_records__namespace_scope_key` keys on the pair. That is
 * correct rather than a loophole: the same verified human may do both, each
 * exactly once per verification, and neither claim can be replayed as the
 * other. The purposes `VERIFICATION_PURPOSES` publishes are `SUBMISSION` and
 * `STEP_UP`; Ready-Made checkout is a customer submitting something, so it
 * reuses `SUBMISSION` rather than adding a third purpose — which would be a
 * migration, and `APP12-B02` §6 has none.
 */

/** `ADR-DB1-017` r1 — the operation family, never assembled from request data. */
export const READY_MADE_ORDER_CREATE_NAMESPACE = 'readyMadeOrder.create';

/**
 * The claim lease.
 *
 * The same value and the same reasoning as `SUBMISSION_IDEMPOTENCY_TTL_MS`: DB3
 * files a customer-facing submission under the **medium (`submission`)** TTL
 * class and records that the class values are deferred policy config (CON-144),
 * so this is that class rendered as a number. It bounds only how long a *stuck*
 * `IN_PROGRESS` claim blocks a genuine retry; every successful creation
 * completes its record inside one transaction, so no ordinary path waits on it.
 * When CON-144 publishes the class values this constant is replaced by that
 * read, not re-decided.
 */
export const READY_MADE_ORDER_IDEMPOTENCY_TTL_MS = 86_400_000;

/**
 * `READY_MADE_INITIAL_RESERVATION_WINDOW` — 24 hours (`BR-025`, `APP12-P01` §K).
 *
 * Measured from the **order's own `created_at`**, as the database recorded it,
 * never from a client clock and never rounded to a boundary. The stored instant
 * is the authority; nothing displays a countdown derived from anything else.
 *
 * `APP12-B03` resets the window to `shipping_fee_confirmed_at + 24h` when the
 * first `FULL` obligation is created, and `APP12-B04`/`B05` clear it on
 * satisfaction. Those are separate constants for separate events; this one is
 * only the initial window.
 */
export const READY_MADE_INITIAL_RESERVATION_WINDOW_MS = 86_400_000;
