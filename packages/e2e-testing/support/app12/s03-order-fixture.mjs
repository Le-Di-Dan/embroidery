/**
 * The `APP12-S03` commercial evidence reader and its two bounded seams.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. S03 drives the whole Ready-Made customer tail — orders, obligations,
 * payment attempts, transfer evidence, reservations, `ORDER_ACCESS` grants and
 * fulfilment transitions — and none of those are rows a harness can tidy up
 * afterwards: `order_items` is undeletable by design (`APP12-B02`), a satisfied
 * obligation is immutable history, and a dispatch snapshot is frozen by a
 * trigger. The only cleanup that cannot leave something behind is dropping the
 * whole database, which is what the run does.
 *
 * `assertDisposable` refuses anything else, so that is enforced rather than
 * remembered. The shared development database receives nothing.
 *
 * ## What it never returns
 *
 * The `ORDER_ACCESS` token, in any form. `secure_access_grants` stores a
 * **hash** and never the plaintext, and no `*_hash`, `*_digest` or `token`
 * column is selected anywhere below — so neither the secret nor a digest of it
 * reaches an assertion, a log line or a Playwright attachment. Contact values
 * are never selected either.
 *
 * ## The catalog is `APP12-S02`'s, reused
 *
 * S03 needs one purchasable Product with stock, which is exactly what
 * `seedS02Catalog` already writes. Seeding a second near-identical catalog would
 * be duplication with no acceptance value, so the run imports that one. The
 * `app12-s02-e2e` prefix on those rows is therefore accurate rather than stale:
 * they *are* the S02 fixture, borrowed.
 */
import pg from 'pg';

const { Client } = pg;

/**
 * Refuses to touch anything but a disposable database.
 *
 * `createDisposableDatabase` names every database it makes `embroidery_db7_*`,
 * and the persistent development database is plain `embroidery`. Checking the
 * name is what keeps a mistyped `E2E_POSTGRES_PORT` from pointing this at the
 * shared stack — the failure mode this guard exists for, because commercial
 * rows written there could not be removed afterwards.
 */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to open the APP12-S03 evidence reader against "${name}": only a disposable ` +
        'database (embroidery_db7_*) may receive S03 commercial writes. See ' +
        'VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

/**
 * Reads the commercial rows the run creates, and owns the two bounded seams the
 * live journeys cannot reach through a delivered command.
 *
 * Every read returns a count, a status, an exact amount the customer was
 * already shown, or an opaque id the harness needs to address a **delivered
 * Admin operation**. Nothing here decides anything the application decides.
 */
export async function createS03Evidence(databaseUrl) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const count = async (text, values = []) =>
    Number((await client.query(text, values)).rows[0]?.count ?? 0);

  const one = async (text, values = []) => (await client.query(text, values)).rows[0];

  return {
    close: () => client.end(),

    /**
     * The order's opaque id, from the code the customer was shown.
     *
     * The **only** reason this exists: every delivered Admin operation is
     * addressed by `orderId`, and the customer surface publishes a code. The
     * harness is doing what an operator's queue click does, without an Admin UI
     * to click — `APP12-A03` owns that screen and is not authorized here.
     */
    orderIdOf: async (orderCode) => {
      const row = await one(`select id from orders where code = $1`, [orderCode]);
      if (row === undefined) throw new Error(`No order with the given code exists.`);
      return row.id;
    },

    /** The order's own LC-14 state, as stored. */
    orderStatusOf: async (orderCode) =>
      (await one(`select status from orders where code = $1`, [orderCode]))?.status,

    /** The order's recorded cancellation reason, when it has one. */
    cancelledReasonOf: async (orderCode) =>
      (await one(`select cancelled_reason from orders where code = $1`, [orderCode]))
        ?.cancelled_reason,

    /**
     * The live `FULL` obligation: its exact amount and its own status.
     *
     * `status in ('PENDING','SATISFIED')` is the schema's own liveness
     * predicate — `uq_payment_obligations__order_kind__live` is partial on
     * exactly those two — so this returns the obligation a fee correction
     * leaves current, never the one it superseded.
     */
    liveFullObligationOf: async (orderCode) =>
      one(
        `select b.id, b.amount, b.status
           from payment_obligations b
           join orders o on o.id = b.order_id
          where o.code = $1 and b.kind = 'FULL'
            and b.status in ('PENDING', 'SATISFIED')`,
        [orderCode],
      ),

    /** Every FULL obligation this order has ever had, oldest first. */
    fullObligationHistoryOf: async (orderCode) =>
      (
        await client.query(
          `select b.amount, b.status
             from payment_obligations b
             join orders o on o.id = b.order_id
            where o.code = $1 and b.kind = 'FULL'
            order by b.created_at asc`,
          [orderCode],
        )
      ).rows,

    /**
     * The attempt the customer's own initiation opened against the live FULL
     * obligation.
     *
     * Needed to address `adminPaymentAttempt_verify`, which is keyed by
     * `attemptId`. The customer's browser holds it in memory and never publishes
     * it, so the harness reads the row the customer's action created rather than
     * inventing one.
     */
    liveFullAttemptOf: async (orderCode) =>
      one(
        `select a.id, a.amount, a.status
           from payment_attempts a
           join payment_obligations b on b.id = a.payment_obligation_id
           join orders o on o.id = b.order_id
          where o.code = $1 and b.kind = 'FULL'
            and b.status in ('PENDING', 'SATISFIED')
          order by a.created_at desc
          limit 1`,
        [orderCode],
      ),

    /** Attempts against this order's FULL obligations, by obligation amount. */
    fullAttemptsOf: async (orderCode) =>
      (
        await client.query(
          `select a.amount, a.status, b.amount as obligation_amount, b.status as obligation_status
             from payment_attempts a
             join payment_obligations b on b.id = a.payment_obligation_id
             join orders o on o.id = b.order_id
            where o.code = $1 and b.kind = 'FULL'
            order by a.created_at asc`,
          [orderCode],
        )
      ).rows,

    /** Transfer images recorded against this order's attempts. */
    countEvidenceFor: async (orderCode) =>
      count(
        `select count(*)::int as count
           from payment_transfer_evidence e
           join payment_attempts a on a.id = e.payment_attempt_id
           join payment_obligations b on b.id = a.payment_obligation_id
           join orders o on o.id = b.order_id
          where o.code = $1`,
        [orderCode],
      ),

    /** Live `ORDER_ACCESS` grants. Counted and scoped; never read. */
    countOrderAccessGrants: () =>
      count(
        `select count(*)::int as count from secure_access_grants
          where scope_kind = 'ORDER_ACCESS' and status = 'ACTIVE'`,
      ),

    /** Every READY_MADE order this database holds. */
    countReadyMadeOrders: () =>
      count(`select count(*)::int as count from orders where origin = 'READY_MADE'`),

    /** The reservation standing against this order, with its own status. */
    reservationOf: async (orderCode) =>
      one(
        `select r.status, r.expires_at
           from inventory_reservations r
           join orders o on o.id = r.order_id
          where o.code = $1
          order by r.created_at desc
          limit 1`,
        [orderCode],
      ),

    /**
     * **Bounded seam 1** — makes a live reservation due, so the real expiry
     * sweep has something to find (Journey B).
     *
     * There is no delivered command that shortens a reservation window: the
     * expiry is 24 hours measured from the order's own creation instant, and no
     * operator surface may move it. The alternative would be a test that waits a
     * day, which is not a test. So the run moves the **clock the sweep reads**
     * rather than the outcome it produces: `expires_at` goes into the past and
     * everything after it — the claim, the release, the cancellation, the
     * `terminationReason` — is produced by the real
     * `ExpireReadyMadeReservationsUseCase` running in the real worker.
     *
     * It writes one timestamp on one row of a disposable database, changes no
     * status, and leaves every constraint satisfied. Nothing about the assertion
     * it enables is faked: had this written `status = 'EXPIRED'` it would be
     * proving the fixture, which is the mistake `APP12-B03-C1` was rejected for.
     */
    makeReservationDue: async (orderCode) => {
      const result = await client.query(
        `update inventory_reservations r
            set expires_at = now() - interval '1 minute'
           from orders o
          where o.id = r.order_id and o.code = $1 and r.status = 'RESERVED'`,
        [orderCode],
      );
      if (result.rowCount === 0) {
        throw new Error('No RESERVED reservation stood against the order.');
      }
      return result.rowCount;
    },

    /**
     * **Bounded seam 2** — revokes the live `ORDER_ACCESS` grant, so a secure
     * operation mid-session meets the canonical grant-is-gone refusal (§14).
     *
     * No delivered runtime or Admin command revokes an `ORDER_ACCESS` grant:
     * `SecureGrantIssuer.reissue` revokes a `REQUEST_ACCESS` grant as a
     * by-product of minting its successor, and there is no order equivalent.
     * Adding a production revocation endpoint to make a test pass is explicitly
     * forbidden, so this writes the same two columns the issuer's own revoke
     * path writes, on a disposable database, and lets the **application** decide
     * what a revoked grant means — which is the behaviour under test.
     *
     * All three columns move together because the schema says they must:
     * `status` is the lifecycle authority, `revoked_at` its timestamp, and
     * `ck_secure_access_grants__revoke_reason_required` refuses a `REVOKED` row
     * with no reason. Writing a subset would leave a row no production path
     * could produce — and would be rejected by the database, which is exactly
     * the constraint doing its job.
     */
    revokeOrderAccessGrant: async (orderCode) => {
      const result = await client.query(
        `update secure_access_grants g
            set status = 'REVOKED', revoked_at = now(), revoke_reason = $2
           from orders o
          where o.id = g.order_id and o.code = $1
            and g.scope_kind = 'ORDER_ACCESS' and g.status = 'ACTIVE'`,
        [orderCode, 'APP12-S03 acceptance: mid-session secure-link death'],
      );
      if (result.rowCount === 0) {
        throw new Error('No ACTIVE ORDER_ACCESS grant stood for the order.');
      }
      return result.rowCount;
    },
  };
}
