/**
 * Read-only APP5 database evidence for the E01 acceptance run.
 *
 * The same two rules as `support/app4/db-evidence.mjs`, and the same
 * implementation of the first one: every row goes through that module's
 * {@link projectSafe}, which *removes* any column whose name looks secret-bearing
 * and reports its presence as a `has…` boolean instead. It is imported rather
 * than re-implemented, so a pattern added there covers APP5 too — and it is why
 * `custom_requests.code` never appears here as a value. The run learns the
 * request code from the confirmation screen, which is where a customer learns it.
 *
 * The second rule — no generic SQL console — is why each function below answers
 * one question the E01 journeys actually ask, scoped to one request or one
 * challenge. Nothing here can list a table.
 *
 * Test-only. Never imported by application code.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';
import { evidenceClientConfig, projectSafe } from '../app4/db-evidence.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/**
 * Creates the APP5 evidence readers against one disposable database.
 *
 * Its own pool, like the APP4 evidence module's: evidence must never travel
 * through the graph under test, or a broken read would be reported as a
 * consistent one.
 */
export async function createApp5Evidence(databaseUrl) {
  const { createDatabaseClient, executeRaw, sql } = requireFromApi('@embroidery/database');
  const client = createDatabaseClient(evidenceClientConfig(databaseUrl));

  const rows = async (statement) => {
    const result = await executeRaw(client.db, statement);
    return Array.isArray(result) ? result : (result?.rows ?? []);
  };
  const many = async (statement) => (await rows(statement)).map(projectSafe);
  const one = async (statement) => (await many(statement))[0];
  const count = async (statement) => Number((await rows(statement))[0]?.count ?? 0);

  return {
    /** Every request this run created, oldest first. Never more than a handful. */
    listRequests: () => many(sql`SELECT * FROM custom_requests ORDER BY created_at ASC LIMIT 20`),

    countRequests: () => count(sql`SELECT COUNT(*)::int AS count FROM custom_requests`),

    readRequest: (requestId) => one(sql`SELECT * FROM custom_requests WHERE id = ${requestId}`),

    /**
     * The one request whose code matches — by digest-free equality inside the
     * statement, so the code is a *parameter* and never a returned value.
     * This is how a run that only knows the customer-visible code (the
     * confirmation screen's) reaches the row without printing it.
     */
    findRequestIdByCode: async (code) => {
      const found = await rows(sql`SELECT id FROM custom_requests WHERE code = ${code}`);
      return found[0]?.id;
    },

    readCustomerOwnedProduct: (requestId) =>
      one(sql`SELECT * FROM customer_owned_products WHERE custom_request_id = ${requestId}`),

    listQuantities: (requestId) =>
      many(sql`
        SELECT * FROM custom_request_quantity_breakdowns
        WHERE custom_request_id = ${requestId} ORDER BY created_at ASC
      `),

    listRequestAssets: (requestId) =>
      many(sql`
        SELECT * FROM custom_request_assets
        WHERE custom_request_id = ${requestId} ORDER BY created_at ASC
      `),

    listTransitions: (requestId) =>
      many(sql`
        SELECT * FROM custom_request_transitions
        WHERE custom_request_id = ${requestId} ORDER BY created_at ASC
      `),

    listModerationNotes: (requestId) =>
      many(sql`
        SELECT * FROM request_moderation_notes
        WHERE custom_request_id = ${requestId} ORDER BY created_at ASC
      `),

    listGrantsForRequest: (requestId) =>
      many(sql`
        SELECT * FROM secure_access_grants
        WHERE custom_request_id = ${requestId} ORDER BY created_at ASC
      `),

    /** The intake assets one verification challenge produced, with their state. */
    listIntakeAssets: (challengeId) =>
      many(sql`
        SELECT * FROM assets
        WHERE uploaded_via_challenge_id = ${challengeId} ORDER BY created_at ASC
      `),

    /**
     * The design session bound to a submitted catalog request, if any.
     *
     * Read from the request row's own column rather than from the session table,
     * because the fact under test is that `B01` recorded the session it actually
     * submitted — not merely that some session moved to `SUBMITTED`.
     */
    readSubmittedSession: async (requestId) => {
      const [request] = await rows(
        sql`SELECT submitted_session_id FROM custom_requests WHERE id = ${requestId}`,
      );
      const sessionId = request?.submitted_session_id;
      if (sessionId === null || sessionId === undefined) {
        return undefined;
      }
      return one(sql`SELECT * FROM design_sessions WHERE id = ${sessionId}`);
    },

    /** Notification intents, so a run can prove one confirmation was raised. */
    listNotificationIntents: () =>
      many(sql`SELECT * FROM notification_intents ORDER BY created_at ASC LIMIT 20`),

    close: () => client.pool.end(),
  };
}
