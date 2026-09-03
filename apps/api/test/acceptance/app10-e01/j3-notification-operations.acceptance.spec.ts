/**
 * `APP10-E01` journey **J3** — notification operations remain viable.
 *
 * APP10 delivers **no** notification code. `APP10-G01` audited the capability
 * and found APP4-B08 already ships the operational list and the manual replay,
 * with idempotency, eligibility and redaction, and APP4-A01 already ships the
 * Admin panel — so the phase plan removed `APP10-C04`/`B04`/`A03` as
 * `ALREADY_DELIVERED`. What E01 owes is therefore not a rebuild and not a rerun
 * of APP4's suite, but the two cross-boundary questions the phase outcome
 * actually names: can an operator *inspect* a failed delivery without a raw
 * recipient or a provider body reaching them, and is *replaying* it duplicate-
 * safe.
 *
 * Two cases, on the delivered `APP4-B08` harness — the real HTTP application,
 * the real `AuthenticatedAdminGuard`, a real AES-GCM envelope sealed by the
 * production intake, and real delivery attempts driven to terminal by the same
 * `markFailed`/`markDeadLetter` the worker calls. Nothing here writes a status
 * column directly, so "this notification failed" is a state the system produced.
 *
 * ### Reused, deliberately not rerun
 *
 * The whole historical APP4-B08 matrix stays where it is: the status filter set,
 * the unknown-filter refusal, the cache headers, the concurrent-replay collapse,
 * the outbox-append rollback, the expired-challenge and satisfied-intent
 * eligibility refusals, and the 404/400 unknown-target paths.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  FIXTURE_CODE,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  ROUTES,
  createAdminNotificationContext,
  dataOf,
  type AdminNotificationTestContext,
  type TerminalDeliveryFixture,
} from '../../../src/modules/notification/tests/integration/admin-notification-context';

interface Attempt {
  readonly attemptedAt: string;
  readonly channel: string;
  readonly outcome: string;
  readonly errorClass?: string;
}

interface Intent {
  readonly intentId: string;
  readonly status: string;
  readonly channel: string;
  readonly recipientMasked: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly createdAt: string;
  readonly attempts: readonly Attempt[];
}

interface Replay {
  readonly replayIntentId: string;
  readonly status: string;
  readonly outcome: string;
}

/**
 * Envelope and transport internals that must not reach an operator. Searched
 * lowercased against the whole raw body, because an assertion naming only the
 * published fields would still pass with a raw value in a field nobody listed.
 */
const FORBIDDEN_KEYS = [
  'params',
  'reference',
  'challengeid',
  'ciphertext',
  'authtag',
  '"iv"',
  'payload',
  'envelope',
  'providermessageref',
  'providerresponse',
  'stack',
  'contactpointid',
  'sourceoutboxeventid',
  'intentkey',
] as const;

describe('APP10-E01 · J3 notification operations', () => {
  let context: AdminNotificationTestContext;
  let failed: TerminalDeliveryFixture;

  beforeAll(async () => {
    context = await createAdminNotificationContext('app10-e01-j3-notification');
    await context.reset();
    await context.seedAdminSession();
    // One notification driven to terminal transport failure through the real
    // intake and the real attempt-recording path.
    failed = await context.seedTerminalDelivery({
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
      secret: FIXTURE_CODE,
      secretKind: 'VERIFICATION_CODE',
    });
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  const authed = () => ({ Cookie: context.adminCookie() });

  const list = (query = '') =>
    request(context.server()).get(`${ROUTES.list()}${query}`).set(authed());

  const replay = (intentId: string) =>
    request(context.server()).post(ROUTES.replay(intentId)).set(authed());

  /**
   * How many notifications exist at all — global, not scoped to one intent, so a
   * duplicate appearing under another key could not hide from the count.
   */
  const intentCount = async (): Promise<number> => {
    const result = await context.disposable.client.db.execute(
      sql`select count(*)::int as total from notification_intents`,
    );
    return (result.rows[0] as { total: number }).total;
  };

  /** E01-07 — J3-C1. */
  it('E01-07 · lets an operator inspect a failed delivery with the recipient and provider redacted', async () => {
    const response = await list('?status=FAILED').expect(200);
    const { intents } = dataOf<{ readonly intents: readonly Intent[] }>(response);
    expect(intents).toHaveLength(1);

    const intent = intents[0];
    expect(intent?.intentId).toBe(failed.intentId);
    expect(intent?.status).toBe('FAILED');

    // The operator learns *who* only as the frozen mask — never the address.
    expect(intent?.recipientMasked).toBe(FIXTURE_EMAIL_MASK);

    // And *why* only as the bounded class the worker chose. The attempt timeline
    // is chronological, and every attempt carries its class and nothing else.
    expect(intent?.attempts.length).toBeGreaterThan(0);
    expect(intent?.attempts.at(-1)?.outcome).toBe('FAILED_TERMINAL');
    for (const attempt of intent?.attempts ?? []) {
      expect(Object.keys(attempt).sort()).toEqual([
        'attemptedAt',
        'channel',
        'errorClass',
        'outcome',
      ]);
      expect(attempt.errorClass).toBeTruthy();
    }
    const instants = (intent?.attempts ?? []).map((a) => Date.parse(a.attemptedAt));
    expect(instants).toEqual([...instants].sort((left, right) => left - right));

    // Exactly the safe field set, and nothing beside it.
    expect(Object.keys(intent ?? {}).sort()).toEqual([
      'attempts',
      'channel',
      'createdAt',
      'intentId',
      'recipientMasked',
      'status',
      'templateKey',
      'templateVersion',
    ]);

    // No raw recipient, no sealed secret, no envelope member, no provider body
    // and no stack — by value and by key, across the whole raw response.
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(FIXTURE_EMAIL);
    expect(raw).not.toContain(FIXTURE_CODE);
    for (const key of FORBIDDEN_KEYS) {
      expect(raw.toLowerCase()).not.toContain(key);
    }
  });

  /** E01-08 — J3-C2. */
  it('E01-08 · replays the failed delivery once and answers an equivalent repeat safely', async () => {
    const before = await intentCount();

    const first = dataOf<Replay>(await replay(failed.intentId).expect(200));
    expect(first.outcome).toBe('CREATED');
    expect(first.status).toBe('PENDING');
    expect(first.replayIntentId).not.toBe(failed.intentId);

    // Exactly one new notification exists, and the terminal origin is untouched:
    // a replay is a new delivery of the same sealed envelope, never a rewrite of
    // the record that failed.
    const afterFirst = await intentCount();
    expect(afterFirst).toBe(before + 1);

    // The equivalent repeat is collapsed onto the same replay by the delivered
    // idempotency authority — a safe success the client can tell apart, so an
    // operator is never shown a confirmation for work this request did not do.
    const second = dataOf<Replay>(await replay(failed.intentId).expect(200));
    expect(second.outcome).toBe('EXISTING');
    expect(second.replayIntentId).toBe(first.replayIntentId);

    // And it created no uncontrolled duplicate work.
    expect(await intentCount()).toBe(afterFirst);

    // The origin is still the terminal failure the operator was inspecting, so
    // the evidence of what went wrong survives its own replay.
    const { intents } = dataOf<{ readonly intents: readonly Intent[] }>(
      await list('?status=FAILED').expect(200),
    );
    expect(intents.map((row) => row.intentId)).toEqual([failed.intentId]);

    // The replay is visible, masked exactly as the origin was, and leaks nothing.
    const pending = await list('?status=PENDING').expect(200);
    const pendingIntents = dataOf<{ readonly intents: readonly Intent[] }>(pending).intents;
    expect(pendingIntents.map((row) => row.intentId)).toContain(first.replayIntentId);
    for (const row of pendingIntents) {
      expect(row.recipientMasked).toBe(FIXTURE_EMAIL_MASK);
    }
    const raw = JSON.stringify(pending.body);
    expect(raw).not.toContain(FIXTURE_EMAIL);
    expect(raw).not.toContain(FIXTURE_CODE);
  });
});
