/**
 * `DB3 CC-18` — duplicate submit, proven for the first time (`APP5-G01` §2.1).
 *
 * G01 records that this race has a specification and **no implementation and no
 * DB8 row**: `DB8_RACE_COVERAGE_MATRIX.md` renumbered `CC-18` onto an unrelated
 * inventory race and contains no duplicate-submit row at all, for the same
 * reason it records for CC-13 — no application-layer consumer existed when DB8
 * ran. `APP5-B01` is that consumer, so this is the proof.
 *
 * ### It is a real race, not a simulated one
 *
 * Two genuine HTTP requests are issued without awaiting the first, against the
 * real application and one real PostgreSQL, over separate pooled connections.
 * There is no mocked mutex, no injected barrier and no serialisation helper: the
 * arbiter under test is `uq_idempotency_records__namespace_scope_key`, and a
 * test that arranged the ordering itself would be asserting its own arrangement.
 *
 * ### What the loser is allowed to do
 *
 * Either canonical outcome is accepted — the completed-replay `201` carrying the
 * *same* result, or the retryable in-progress `409` — because which one it sees
 * depends on how PostgreSQL resolves a speculative insert against an uncommitted
 * conflicting row, which is the database's decision and not this endpoint's.
 * (In practice it waits: the loser blocks on the unique index until the winner
 * commits and then replays the completed result. That is an observation, not a
 * contract, and pinning it would make this suite a test of PostgreSQL.)
 * What it may **never** do is create a second logical request, and that is
 * asserted by row count against every one of the `G01-D11` consequences rather
 * than by reading the responses.
 *
 * One deterministic race, run once. Looping it dozens of times would trade a
 * clear proof for a flaky one.
 */
import { sql } from 'drizzle-orm';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  applyApp5SubmissionSecretEnv,
  publishGrantPolicy,
  seedSubmissionContext,
  SAME_ORIGIN_HEADERS,
  type SubmissionFixture,
} from '../support/custom-request-submission-fixture';

const SUBMIT_PATH = '/api/public/custom-requests';

interface SubmissionEnvelope {
  readonly code?: string;
  readonly data?: { readonly requestId?: string; readonly code?: string; readonly status?: string };
}

describe('APP5-B01 duplicate submit (DB3 CC-18)', () => {
  let context: ApiIntegrationTestContext;
  let restoreSecretEnv: () => void;
  let fixture: SubmissionFixture;
  let responses: { status: number; body: SubmissionEnvelope }[];

  beforeAll(async () => {
    restoreSecretEnv = applyApp5SubmissionSecretEnv();
    context = await createApiIntegrationContext('app5_b01_race');
    await publishGrantPolicy(context.app, context.database);
    fixture = await seedSubmissionContext(context.database, { label: 'race' });

    const body = {
      challengeId: fixture.challengeId,
      catalog: {
        productId: fixture.productId,
        productVariantId: fixture.productVariantId,
        designSessionId: fixture.designSessionId,
      },
      breakdown: [{ sizeLabel: 'M', quantity: 10 }],
    };

    // Both issued before either is awaited: the same challenge, the same
    // canonical fingerprint, two connections, one arbiter.
    const submit = (): Promise<{ status: number; body: SubmissionEnvelope }> =>
      context.http
        .post(SUBMIT_PATH)
        .set(SAME_ORIGIN_HEADERS)
        .set('cookie', fixture.sessionCookie)
        .send(body)
        .then((response) => ({
          status: response.status,
          body: response.body as SubmissionEnvelope,
        }));

    responses = await Promise.all([submit(), submit()]);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
    restoreSecretEnv?.();
  });

  const db = () => context.database.client.db;

  const countOf = async (statement: ReturnType<typeof sql>): Promise<number> => {
    const rows = await db().execute<{ count: string }>(statement);
    return Number(rows.rows[0]?.count ?? 0);
  };

  const requestId = (): string =>
    responses.find((response) => response.status === 201)?.body.data?.requestId ?? '';

  it('gives at least one participant the created request', () => {
    expect(responses.some((response) => response.status === 201)).toBe(true);
    expect(requestId()).not.toBe('');
  });

  it('gives the other participant a canonical outcome — replay or in-progress', () => {
    for (const response of responses) {
      if (response.status === 201) {
        // A replay is indistinguishable from the original, which is what makes a
        // client-side retry safe.
        expect(response.body.data?.requestId).toBe(requestId());
        continue;
      }
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DUPLICATE_OPERATION');
    }
  });

  it('creates exactly one custom request', async () => {
    expect(
      await countOf(
        sql`select count(*) as count from custom_requests where customer_id = ${fixture.customerId}`,
      ),
    ).toBe(1);
  });

  it('holds exactly one idempotency record for the challenge', async () => {
    const rows = await db().execute<{ status: string }>(sql`
      select status from idempotency_records
      where operation_namespace = 'request.submit' and scope_key = ${fixture.challengeId}
    `);
    expect(rows.rows).toEqual([{ status: 'COMPLETED' }]);
  });

  it('creates exactly one design case and no design version', async () => {
    expect(
      await countOf(
        sql`select count(*) as count from design_cases where custom_request_id = ${requestId()}`,
      ),
    ).toBe(1);
    expect(
      await countOf(sql`
        select count(*) as count from design_versions v
        join design_cases c on c.id = v.design_case_id
        where c.custom_request_id = ${requestId()}
      `),
    ).toBe(0);
  });

  it('submits the design session once, to that one request', async () => {
    const rows = await db().execute<{ status: string; submitted_request_id: string }>(sql`
      select status, submitted_request_id from design_sessions where id = ${fixture.designSessionId}
    `);
    expect(rows.rows).toEqual([{ status: 'SUBMITTED', submitted_request_id: requestId() }]);
  });

  it('issues exactly one REQUEST_ACCESS grant and one delivery intent', async () => {
    expect(
      await countOf(
        sql`select count(*) as count from secure_access_grants where customer_id = ${fixture.customerId}`,
      ),
    ).toBe(1);
    expect(
      await countOf(sql`
        select count(*) as count from notification_intents
        where recipient_contact_point_id = ${fixture.contactPointId}
      `),
    ).toBe(1);
  });

  it('appends exactly one protected submission outbox event', async () => {
    expect(
      await countOf(sql`
        select count(*) as count from outbox_events
        where aggregate_kind = 'CUSTOM_REQUEST' and aggregate_id = ${requestId()}
          and event_type = 'request.submitted'
      `),
    ).toBe(1);
  });

  it('writes no transition row — creation is not a move (G01-D05)', async () => {
    expect(
      await countOf(sql`
        select count(*) as count from custom_request_transitions
        where custom_request_id = ${requestId()}
      `),
    ).toBe(0);
  });
});
