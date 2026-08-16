/**
 * The APP5 intake cleanup bounds (`APP5-B02` §7).
 *
 * Deliberately constants rather than worker policy rows. The nine values
 * `WorkerPolicyService` publishes describe the *claim* runtime — lease
 * duration, batch size, retry curve — and this sweep claims nothing: it is not
 * an outbox-driven job, so borrowing that policy would attach meaning to values
 * that were sized for a different mechanism.
 *
 * Nothing here is a business rule either. The business rule is
 * `intake_expires_at`, which the API copied from the authorizing challenge; a
 * sweep interval only decides how soon after that instant the object actually
 * disappears.
 */

/**
 * How often the sweep runs.
 *
 * Five minutes, because the thing being deleted is an expired *unbound* upload:
 * nothing is waiting on it, and the retention obligation is measured in the
 * challenge's TTL rather than in minutes. Sweeping faster would buy nothing and
 * would put a periodic query on the assets table for no reader.
 */
export const INTAKE_CLEANUP_INTERVAL_MS = 300_000;

/**
 * How many rows one pass touches, per phase.
 *
 * Bounded so a backlog is drained across passes instead of in one long
 * transaction holding locks on a table the API writes to on every upload. A
 * pass that fills its batch simply leaves the rest for the next one.
 */
export const INTAKE_CLEANUP_BATCH_SIZE = 100;

/**
 * The recorded reason on the tombstone.
 *
 * `deletion_reason` is operator-facing, retained on the row, and never returned
 * by a public route. It names the rule rather than the file so a row's history
 * says *why* the system removed it, which is the only question an operator
 * looking at a tombstone actually has.
 */
export const INTAKE_CLEANUP_REASON = 'APP5 intake window expired without submission';
