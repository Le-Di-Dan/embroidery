/**
 * `APP4-B08` — Admin manual transport replay, through the whole HTTP stack.
 *
 * The claims that only a real database and a real pipeline can make:
 *
 * - **both terminal records survive untouched** — the origin intent stays
 *   `FAILED` in every column, and the `DEAD_LETTER` outbox row is byte-identical
 *   afterwards including its attempt counter;
 * - **the envelope is copied, not re-sealed** — the replay event's ciphertext,
 *   IV and auth tag equal the source's exactly, which is only possible if
 *   nothing decrypted and re-encrypted it (a fresh seal mints a new IV by
 *   construction);
 * - **the new event points at the new intent** — `aggregate_id` diverges from
 *   the encrypted lineage, which is what lets `APP4-W01` find the right
 *   lifecycle target without decrypting;
 * - **the replay starts with a clean budget** — zero delivery attempts, and a
 *   new outbox id, which is the worker's `job_key`;
 * - **duplicates and concurrent calls collapse onto one replay**, through the
 *   deterministic key and the row lock rather than a mutex.
 */
import { newId } from '@embroidery/database';
import { OutboxEventStore } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  FIXTURE_CODE,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  FIXTURE_TOKEN,
  ROUTES,
  createAdminNotificationContext,
  dataOf,
  type AdminNotificationTestContext,
  type TerminalDeliveryFixture,
} from './admin-notification-context';

interface ReplayPayload {
  readonly replayIntentId: string;
  readonly status: string;
}

// Type aliases rather than interfaces: `db.execute<T>` constrains `T` to
// `Record<string, unknown>`, and only an object *type* gets TypeScript's
// implicit index signature.
type IntentRow = {
  readonly id: string;
  readonly status: string;
  readonly intent_key: string;
  readonly template_key: string;
  readonly channel: string;
  readonly recipient_masked: string;
  readonly params: unknown;
  readonly source_outbox_event_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
};

type EventRow = {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_kind: string;
  readonly aggregate_id: string;
  readonly status: string;
  readonly payload: Record<string, string>;
  readonly payload_schema_version: number;
  readonly attempt_count: number;
  readonly last_error: string | null;
};

describe('APP4-B08 Admin manual replay (integration)', () => {
  let context: AdminNotificationTestContext;

  beforeAll(async () => {
    context = await createAdminNotificationContext('app4-b08-replay');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const db = () => context.disposable.client.db;

  const replay = (intentId: string) =>
    request(context.server()).post(ROUTES.replay(intentId)).set('Cookie', context.adminCookie());

  async function intentRow(id: string): Promise<IntentRow> {
    const result = await db().execute<IntentRow>(
      sql`select * from notification_intents where id = ${id}`,
    );
    return result.rows[0] as IntentRow;
  }

  async function eventRow(id: bigint | string): Promise<EventRow> {
    const result = await db().execute<EventRow>(
      sql`select * from outbox_events where id = ${id.toString()}`,
    );
    return result.rows[0] as EventRow;
  }

  async function allEvents(): Promise<readonly EventRow[]> {
    const result = await db().execute<EventRow>(sql`select * from outbox_events order by id`);
    return result.rows;
  }

  async function allIntents(): Promise<readonly IntentRow[]> {
    const result = await db().execute<IntentRow>(
      sql`select * from notification_intents order by created_at, id`,
    );
    return result.rows;
  }

  async function auditRows(): Promise<
    readonly {
      action: string;
      actor_kind: string;
      admin_id: string | null;
      target_id: string;
      summary: Record<string, unknown>;
    }[]
  > {
    const result = await db().execute<{
      action: string;
      actor_kind: string;
      admin_id: string | null;
      target_id: string;
      summary: Record<string, unknown>;
    }>(
      sql`select action, actor_kind, admin_id, target_id, summary from audit_events order by occurred_at`,
    );
    return result.rows;
  }

  async function attemptCount(intentId: string): Promise<number> {
    const result = await db().execute<{ total: string }>(
      sql`select count(*)::text as total from notification_delivery_attempts where intent_id = ${intentId}`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async function seedEligibleVerification(): Promise<TerminalDeliveryFixture> {
    return context.seedTerminalDelivery({
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: await context.seedChallenge() },
      secret: FIXTURE_CODE,
      secretKind: 'VERIFICATION_CODE',
    });
  }

  describe('an eligible verification code', () => {
    it('creates a new PENDING notification and leaves both terminal records alone', async () => {
      const source = await seedEligibleVerification();
      const originBefore = await intentRow(source.intentId);
      const deadLetterBefore = await eventRow(source.outboxEventId);
      expect(originBefore.status).toBe('FAILED');
      expect(deadLetterBefore.status).toBe('DEAD_LETTER');

      const response = await replay(source.intentId).expect(200);
      const payload = dataOf<ReplayPayload>(response);

      expect(payload.status).toBe('PENDING');
      expect(payload.replayIntentId).not.toBe(source.intentId);

      // Both terminal records, column for column.
      expect(await intentRow(source.intentId)).toEqual(originBefore);
      expect(await eventRow(source.outboxEventId)).toEqual(deadLetterBefore);

      const replayIntent = await intentRow(payload.replayIntentId);
      expect(replayIntent.status).toBe('PENDING');
      expect(replayIntent.template_key).toBe(originBefore.template_key);
      expect(replayIntent.channel).toBe(originBefore.channel);
      expect(replayIntent.recipient_masked).toBe(FIXTURE_EMAIL_MASK);
      expect(replayIntent.params).toEqual(originBefore.params);
      // The non-secret replay-origin trace, on the existing no-FK field.
      expect(replayIntent.source_outbox_event_id).toBe(source.outboxEventId.toString());
      // A derived key, not the origin's — CST-047 admits one row per key.
      expect(replayIntent.intent_key).not.toBe(originBefore.intent_key);
      expect(replayIntent.intent_key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('appends one PENDING event carrying the source envelope verbatim', async () => {
      const source = await seedEligibleVerification();

      const payload = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));

      const events = await allEvents();
      expect(events).toHaveLength(2);
      const replayEvent = events.find((event) => event.id !== source.outboxEventId.toString());
      expect(replayEvent).toBeDefined();

      expect(replayEvent?.status).toBe('PENDING');
      expect(replayEvent?.event_type).toBe('notification.delivery.requested');
      expect(replayEvent?.aggregate_kind).toBe('NOTIFICATION_INTENT');
      // §22 — same kind, different id. The new event names the replay intent.
      expect(replayEvent?.aggregate_id).toBe(payload.replayIntentId);
      expect(replayEvent?.aggregate_id).not.toBe(source.intentId);
      // §23 — a new event id is a new worker `job_key`, and nothing wrote a
      // counter by hand.
      expect(replayEvent?.id).not.toBe(source.outboxEventId.toString());
      expect(replayEvent?.attempt_count).toBe(0);
      expect(replayEvent?.last_error).toBeNull();

      // §21 — the encrypted fields are identical, which a re-seal could not
      // produce: `sealDeliveryEnvelope` mints a fresh random IV every time.
      expect(replayEvent?.payload).toEqual(source.payload);
      for (const field of ['iv', 'ciphertext', 'authTag', 'version', 'algorithm']) {
        expect(replayEvent?.payload[field]).toBe((source.payload as Record<string, string>)[field]);
      }
      expect(replayEvent?.payload_schema_version).toBe(source.payloadSchemaVersion);
    });

    it('starts the replay with a clean delivery budget and leaves the origin’s alone', async () => {
      const source = await seedEligibleVerification();
      expect(await attemptCount(source.intentId)).toBe(3);

      const payload = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));

      expect(await attemptCount(payload.replayIntentId)).toBe(0);
      expect(await attemptCount(source.intentId)).toBe(3);

      // No background-job attempt identity exists for the new event yet.
      const jobs = await db().execute<{ total: string }>(
        sql`select count(*)::text as total from background_job_attempts`,
      );
      expect(jobs.rows[0]?.total).toBe('0');
    });

    it('audits the replay against the authenticated Admin', async () => {
      const source = await seedEligibleVerification();

      const payload = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      const [event] = rows;
      expect(event?.action).toBe('notification.delivery.replayed');
      expect(event?.actor_kind).toBe('ADMIN');
      expect(event?.admin_id).toBe(context.adminId());
      // The target is the origin — the id an operator was given.
      expect(event?.target_id).toBe(source.intentId);
      expect(event?.summary['operation']).toBe('MANUAL_TRANSPORT_REPLAY');
      expect(event?.summary['replayIntentId']).toBe(payload.replayIntentId);
      expect(event?.summary['sourceOutboxEventId']).toBe(source.outboxEventId.toString());
    });
  });

  describe('an eligible secure grant', () => {
    it('replays the same envelope and mints no new grant or token', async () => {
      const grantId = await context.seedGrant();
      const source = await context.seedTerminalDelivery({
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId },
        secret: FIXTURE_TOKEN,
        secretKind: 'SECURE_LINK_TOKEN',
        templateKey: 'secure.link',
      });
      const grantsBefore = await db().execute(sql`select * from secure_access_grants order by id`);

      const payload = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));

      const events = await allEvents();
      const replayEvent = events.find((event) => event.id !== source.outboxEventId.toString());
      expect(replayEvent?.payload).toEqual(source.payload);
      expect(replayEvent?.aggregate_id).toBe(payload.replayIntentId);

      // No grant was issued, reissued, revoked or superseded.
      const grantsAfter = await db().execute(sql`select * from secure_access_grants order by id`);
      expect(grantsAfter.rows).toEqual(grantsBefore.rows);
      expect(grantsAfter.rows).toHaveLength(1);
    });
  });

  describe('idempotency', () => {
    it('returns the same replay on a second sequential call and appends nothing', async () => {
      const source = await seedEligibleVerification();

      const first = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));
      const second = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));

      expect(second.replayIntentId).toBe(first.replayIntentId);
      expect(second.status).toBe('PENDING');

      expect(await allIntents()).toHaveLength(2);
      expect(await allEvents()).toHaveLength(2);
      // The second call created nothing, so it audited nothing.
      expect(await auditRows()).toHaveLength(1);
    });

    it('collapses two concurrent replays onto one', async () => {
      const source = await seedEligibleVerification();

      const [left, right] = await Promise.all([
        replay(source.intentId).expect(200),
        replay(source.intentId).expect(200),
      ]);

      const leftId = dataOf<ReplayPayload>(left).replayIntentId;
      const rightId = dataOf<ReplayPayload>(right).replayIntentId;
      expect(leftId).toBe(rightId);

      expect(await allIntents()).toHaveLength(2);
      expect(await allEvents()).toHaveLength(2);
      expect(await auditRows()).toHaveLength(1);
      expect((await intentRow(source.intentId)).status).toBe('FAILED');
      expect((await eventRow(source.outboxEventId)).status).toBe('DEAD_LETTER');
    });
  });

  describe('atomicity', () => {
    it('rolls the whole replay back when the outbox append fails', async () => {
      const source = await seedEligibleVerification();
      const originBefore = await intentRow(source.intentId);
      const deadLetterBefore = await eventRow(source.outboxEventId);

      // The failure is injected at an existing collaborator, not through
      // production failure-injection infrastructure: the use case's own
      // `OutboxEventStore.append` rejects once, after the replay intent has been
      // inserted inside the transaction.
      const outbox = context.get<OutboxEventStore>(OutboxEventStore);
      const append = jest
        .spyOn(outbox, 'append')
        .mockRejectedValueOnce(new Error('outbox unavailable'));

      await replay(source.intentId).expect(500);
      append.mockRestore();

      // Nothing survived the rollback.
      expect(await allIntents()).toHaveLength(1);
      expect(await allEvents()).toHaveLength(1);
      expect(await auditRows()).toHaveLength(0);
      expect(await intentRow(source.intentId)).toEqual(originBefore);
      expect(await eventRow(source.outboxEventId)).toEqual(deadLetterBefore);

      // And the replay is still available afterwards — the rollback left no
      // half-claimed key behind.
      const payload = dataOf<ReplayPayload>(await replay(source.intentId).expect(200));
      expect(payload.status).toBe('PENDING');
    });
  });

  describe('secret evidence', () => {
    it('exposes no secret, recipient or envelope outside the copied ciphertext', async () => {
      const source = await seedEligibleVerification();

      const response = await replay(source.intentId).expect(200);
      const payload = dataOf<ReplayPayload>(response);

      // The HTTP response carries two fields and nothing else.
      expect(Object.keys(payload).sort()).toEqual(['replayIntentId', 'status']);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(FIXTURE_CODE);
      expect(body).not.toContain(FIXTURE_EMAIL);
      for (const forbidden of ['ciphertext', 'authtag', 'payload', 'params', 'intentkey']) {
        expect(body.toLowerCase()).not.toContain(forbidden);
      }

      // The audit row.
      const audit = JSON.stringify(await auditRows());
      expect(audit).not.toContain(FIXTURE_CODE);
      expect(audit).not.toContain(FIXTURE_EMAIL);
      expect(audit).not.toContain(FIXTURE_EMAIL_MASK);
      expect(audit.toLowerCase()).not.toContain('ciphertext');

      // The replay intent's own plaintext columns.
      const replayIntent = await intentRow(payload.replayIntentId);
      const serialized = JSON.stringify(replayIntent);
      expect(serialized).not.toContain(FIXTURE_CODE);
      expect(serialized).not.toContain(FIXTURE_EMAIL);

      // The new outbox row outside `payload`: the ciphertext is copied, and it
      // is the only place the secret exists — still sealed.
      const events = await allEvents();
      const replayEvent = events.find((event) => event.id !== source.outboxEventId.toString());
      const { payload: copied, ...outerColumns } = replayEvent as EventRow;
      expect(JSON.stringify(outerColumns)).not.toContain(FIXTURE_CODE);
      expect(JSON.stringify(copied)).not.toContain(FIXTURE_CODE);
    });
  });

  describe('unknown targets', () => {
    it('answers 404 for an intent that does not exist, and writes nothing', async () => {
      await replay(newId()).expect(404);

      expect(await allIntents()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    });

    it('answers 400 for a malformed intent id', async () => {
      await replay('not-a-uuid').expect(400);
    });
  });
});
