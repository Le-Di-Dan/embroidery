/**
 * Read-only APP4 database evidence for the E01 acceptance run (APP4-E01-H02).
 *
 * Two rules shape every reader here.
 *
 * **Nothing secret-bearing is ever returned.** Rather than enumerating a safe
 * column list per table — which silently starts leaking the day a column is
 * added — every read projects through {@link projectSafe}, which *removes* any
 * column whose name matches the sensitive pattern (hash, digest, ciphertext, iv,
 * auth tag, token, code, secret, pepper). A digest that gains a new name still
 * cannot escape, and the caller is told the column *existed* through a
 * `has<Column>` boolean instead. That is the inverse of the usual allowlist and
 * it is deliberate: the failure mode of a forgotten allowlist entry is a leak,
 * the failure mode here is a missing boolean.
 *
 * **No generic SQL console.** Each function answers one question E01 actually
 * asks. A helper that took arbitrary SQL would move the evidence contract out of
 * this file and into eighteen call sites.
 *
 * Test-only.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/**
 * Column names that may never leave this module.
 *
 * Matched on the name, case-insensitively, anywhere in it — `code_hash`,
 * `token_hash`, `envelope_ciphertext` and `secret_pepper` all match.
 */
const SENSITIVE_COLUMN = /(hash|digest|cipher|iv|auth_?tag|token|code|secret|pepper)/i;

/**
 * A complete client configuration for an evidence connection.
 *
 * Every field is supplied because `createDatabaseClient` interpolates the two
 * timeouts into the connection's `options` string. Omitting one does not fall
 * back to a default — it produces `-c lock_timeout=undefined`, which PostgreSQL
 * rejects, and the failure surfaces as "Failed query" on the first statement
 * rather than as a configuration error.
 */
export function evidenceClientConfig(databaseUrl) {
  return {
    url: databaseUrl,
    poolMax: 4,
    sslMode: 'disable',
    statementTimeoutMs: 15_000,
    lockTimeoutMs: 5_000,
    idleTimeoutMs: 10_000,
    connectionTimeoutMs: 10_000,
  };
}

/**
 * Splits a row into the safe fields and a boolean per withheld field.
 *
 * `code_hash: '…'` becomes `hasCodeHash: true`, so a suite can prove a digest
 * column is populated — which is what `E01-01` and `E01-04` need — without the
 * value ever being readable.
 */
export function projectSafe(row) {
  if (row === undefined || row === null) {
    return undefined;
  }
  const safe = {};
  for (const [column, value] of Object.entries(row)) {
    if (SENSITIVE_COLUMN.test(column)) {
      const camel = column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      safe[`has${camel[0].toUpperCase()}${camel.slice(1)}`] = value !== null && value !== undefined;
      continue;
    }
    safe[column] = value;
  }
  return safe;
}

/**
 * Creates the evidence readers against one disposable database.
 *
 * Takes the runtime's database URL rather than a context, so evidence reads
 * never travel through the graph under test.
 */
export async function createDbEvidence(databaseUrl) {
  const { createDatabaseClient, executeRaw, sql } = requireFromApi('@embroidery/database');
  const client = createDatabaseClient(evidenceClientConfig(databaseUrl));

  const rows = async (statement) => {
    const result = await executeRaw(client.db, statement);
    return Array.isArray(result) ? result : (result?.rows ?? []);
  };
  const one = async (statement) => projectSafe((await rows(statement))[0]);
  const count = async (statement) => Number((await rows(statement))[0]?.count ?? 0);

  return {
    // ---- Verification -----------------------------------------------------
    readChallenge: (challengeId) =>
      one(sql`SELECT * FROM contact_verification_challenges WHERE id = ${challengeId}`),
    readChallengesForContact: async (contactValueDigestFree) =>
      (
        await rows(sql`
          SELECT * FROM contact_verification_challenges
          WHERE contact_kind = ${contactValueDigestFree.kind}
          ORDER BY created_at ASC
        `)
      ).map(projectSafe),
    readVerificationAttempts: async (challengeId) =>
      (
        await rows(sql`
          SELECT * FROM contact_verification_attempts
          WHERE challenge_id = ${challengeId} ORDER BY created_at ASC
        `)
      ).map(projectSafe),
    countCustomers: () => count(sql`SELECT COUNT(*)::int AS count FROM customers`),
    countCustomersForContactPoint: (contactPointId) =>
      count(sql`
        SELECT COUNT(DISTINCT customer_id)::int AS count
        FROM customer_contact_points WHERE id = ${contactPointId}
      `),
    readContactPointsForCustomer: async (customerId) =>
      (
        await rows(sql`
          SELECT * FROM customer_contact_points
          WHERE customer_id = ${customerId} ORDER BY created_at ASC
        `)
      ).map(projectSafe),

    // ---- Notification / outbox -------------------------------------------
    readNotificationIntent: (intentId) =>
      one(sql`SELECT * FROM notification_intents WHERE id = ${intentId}`),
    readNotificationIntentsForContactPoint: async (contactPointId) =>
      (
        await rows(sql`
          SELECT * FROM notification_intents
          WHERE recipient_contact_point_id = ${contactPointId}
          ORDER BY created_at ASC
        `)
      ).map(projectSafe),
    readNotificationAttempts: async (intentId) =>
      (
        await rows(sql`
          SELECT * FROM notification_delivery_attempts
          WHERE notification_intent_id = ${intentId} ORDER BY attempt_number ASC
        `)
      ).map(projectSafe),
    readOutboxEvent: (eventId) => one(sql`SELECT * FROM outbox_events WHERE id = ${eventId}`),
    readOutboxEventsForAggregate: async (aggregateId) =>
      (
        await rows(sql`
          SELECT * FROM outbox_events
          WHERE aggregate_id = ${aggregateId} ORDER BY created_at ASC
        `)
      ).map(projectSafe),

    // ---- Secure grant -----------------------------------------------------
    readGrant: (grantId) => one(sql`SELECT * FROM secure_access_grants WHERE id = ${grantId}`),
    countActiveGrantsForRequest: (customRequestId) =>
      count(sql`
        SELECT COUNT(*)::int AS count FROM secure_access_grants
        WHERE custom_request_id = ${customRequestId} AND status = 'ACTIVE'
      `),

    // ---- Replay comparison ------------------------------------------------
    /**
     * Captures a terminal outbox row for before/after comparison.
     *
     * Returns the safe projection *and* an opaque digest of the envelope fields.
     * The digest is derived in memory from values that never leave this module,
     * so `E01-13`/`E01-14` can prove "byte-identical" and "unchanged" without any
     * ciphertext, IV or auth tag being held by the caller.
     */
    snapshotTerminalOutbox: async (eventId) => {
      const raw = (await rows(sql`SELECT * FROM outbox_events WHERE id = ${eventId}`))[0];
      return {
        safe: projectSafe(raw),
        envelope: envelopeFingerprint(raw),
      };
    },

    /**
     * The rows of one APP4 table, newest last, safely projected.
     *
     * Constrained to a fixed allowlist rather than taking SQL: `APP4-E01-R01`
     * needs "the intent that was just created" and "the outbox event beside it"
     * without a named id to look them up by, and a generic SQL entry point would
     * move the evidence contract out of this file. Ordering is by `created_at`
     * so "the latest" is well defined for a serial acceptance run.
     */
    listRecent: async (table, limit = 20) => {
      if (!LISTABLE_TABLES.has(table)) {
        throw new Error(`Refusing to list "${table}": not an APP4 evidence table.`);
      }
      const statement = sql.raw(
        `SELECT * FROM ${table} ORDER BY created_at ASC LIMIT ${Number(limit)}`,
      );
      return (await rows(statement)).map(projectSafe);
    },

    /**
     * Moves one queued row's own due instant to now.
     *
     * The single mutation this module performs, and deliberately narrow: it
     * writes `next_attempt_at`, which is *queue scheduling*, never business
     * state. `APP4-G01`'s delivery policy retries at 60 and 300 seconds, so a
     * suite that waited would spend six minutes proving a schedule it can
     * observe directly — the same technique `APP4-W01`'s own harness uses. The
     * delay the completion actually wrote is asserted before this is called;
     * this only stops the clock from being the thing under test.
     */
    /**
     * Backdates one challenge's issuance instant.
     *
     * `APP4-G01`'s `resendCooldownSeconds` is measured from `created_at`, so
     * this is the fixture-timestamp seam that makes a resend eligible without
     * waiting the cooldown out. It moves *when the challenge was issued*, never
     * its status, its digest or its expiry — the resend decision itself is
     * still entirely the application's.
     */
    backdateChallenge: async (challengeId, seconds) => {
      await executeRaw(
        client.db,
        sql`
          UPDATE contact_verification_challenges
          SET created_at = created_at - make_interval(secs => ${seconds})
          WHERE id = ${challengeId}
        `,
      );
    },

    makeDueNow: async (eventId) => {
      await executeRaw(
        client.db,
        sql`UPDATE outbox_events SET next_attempt_at = now() WHERE id = ${eventId}`,
      );
    },

    close: () => client.pool.end(),
  };
}

/** The tables `listRecent` may read. Nothing else is reachable through it. */
const LISTABLE_TABLES = new Set([
  'contact_verification_challenges',
  'contact_verification_attempts',
  'customers',
  'customer_contact_points',
  'secure_access_grants',
  'notification_intents',
  'notification_delivery_attempts',
  'outbox_events',
  'audit_events',
]);

/**
 * An in-memory fingerprint per envelope field.
 *
 * Each sensitive field is reduced to a SHA-256 hex digest of its own value, so
 * two snapshots can be compared field by field and the result reported as a
 * boolean. The digests are derived here and are not the stored digests; nothing
 * in a report is ever built from them.
 */
export function envelopeFingerprint(row) {
  if (row === undefined || row === null) {
    return undefined;
  }
  const { createHash } = requireFromApi('node:crypto');
  const fingerprint = {};
  for (const [column, value] of Object.entries(row)) {
    if (!SENSITIVE_COLUMN.test(column) && !/payload|envelope|version|algorithm/i.test(column)) {
      continue;
    }
    fingerprint[column] =
      value === null || value === undefined
        ? null
        : createHash('sha256')
            .update(typeof value === 'string' ? value : JSON.stringify(value))
            .digest('hex');
  }
  return fingerprint;
}
