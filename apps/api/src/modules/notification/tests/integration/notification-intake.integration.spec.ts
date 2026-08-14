/**
 * Notification intent intake against a real PostgreSQL instance (`APP4-B01`).
 *
 * The smallest harness that can prove the thing B01 actually claims: the intent
 * repository, the outbox store and one transaction, composed. A double would
 * prove the code calls what it calls; only a database proves the intent and its
 * delivery event commit together, that `intent_key` uniqueness is what collapses
 * a duplicate, and that the persisted payload contains no plaintext.
 *
 * Every secret below is synthetic.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { NotificationModule } from '../../notification.module';
import { RequestNotificationUseCase } from '../../application/request-notification.use-case';
import { NOTIFICATION_DELIVERY_EVENT_TYPE } from '../../application/request-notification.use-case';
import type { NotificationRequest } from '../../domain/notification-request';

/** A synthetic 32-byte key. Never an operator value. */
const ENVELOPE_KEY = Buffer.alloc(32, 0x5a).toString('base64');
const SYNTHETIC_SECRET = 'synthetic-code-424242';
const RECIPIENT = 'an@vidu.com';

/**
 * A type alias, not an interface: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and only a type alias gets the implicit index
 * signature that satisfies it.
 */
type OutboxRow = {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_kind: string;
  readonly aggregate_id: string;
  readonly payload: Record<string, unknown>;
  readonly payload_schema_version: number;
  readonly status: string;
};

describe('notification intake (integration)', () => {
  let context: PersistenceTestContext;
  let useCase: RequestNotificationUseCase;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'];
    process.env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'] = ENVELOPE_KEY;
    context = await createPersistenceTestContext('app4-b01-intake', [
      RequestContextModule,
      NotificationModule,
    ]);
    useCase = context.get(RequestNotificationUseCase);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
    if (previousKey === undefined) delete process.env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'];
    else process.env['NOTIFICATION_DELIVERY_ENVELOPE_KEY'] = previousKey;
  });

  beforeEach(async () => {
    await context.reset();
  });

  function request(overrides: Partial<NotificationRequest> = {}): NotificationRequest {
    return {
      sourceEventId: 'challenge-0001',
      channel: 'EMAIL',
      contactKind: 'EMAIL',
      normalizedRecipient: RECIPIENT,
      templateKey: 'verification.code',
      templateVersion: 1,
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId: newId() },
      secretKind: 'VERIFICATION_CODE',
      secret: SYNTHETIC_SECRET,
      issuedAt: new Date('2026-08-14T09:12:04.000Z'),
      expiresAt: new Date('2026-08-14T09:22:04.000Z'),
      correlationId: 'req-b01-0001',
      ...overrides,
    };
  }

  async function outboxRows(): Promise<OutboxRow[]> {
    const result = await context.disposable.client.db.execute<OutboxRow>(
      sql`select id, event_type, aggregate_kind, aggregate_id, payload, payload_schema_version, status
          from outbox_events order by id`,
    );
    return result.rows;
  }

  async function intentRows(): Promise<Array<Record<string, unknown>>> {
    const result = await context.disposable.client.db.execute<Record<string, unknown>>(
      sql`select id, intent_key, template_key, channel, recipient_masked, params, correlation_id, status
          from notification_intents order by created_at`,
    );
    return result.rows;
  }

  it('creates one intent and one PENDING delivery event, atomically', async () => {
    const result = await useCase.request(request());
    expect(result.outcome).toBe('created');

    const intents = await intentRows();
    expect(intents).toHaveLength(1);

    const events = await outboxRows();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.event_type).toBe(NOTIFICATION_DELIVERY_EVENT_TYPE);
    expect(event?.status).toBe('PENDING');
    expect(event?.payload_schema_version).toBe(1);
  });

  it('links the event to the current intent in the clear', async () => {
    const result = await useCase.request(request());
    const [event] = await outboxRows();

    expect(event?.aggregate_kind).toBe('NOTIFICATION_INTENT');
    expect(event?.aggregate_id).toBe(result.intentId);

    // The worker's lookup: one relational read, no decryption, no JSON probing.
    const found = await context.disposable.client.db.execute<{ id: string }>(
      sql`select id from notification_intents where id = ${event?.aggregate_id}`,
    );
    expect(found.rows).toHaveLength(1);
  });

  it('persists a secret-free intent with a masked recipient', async () => {
    await useCase.request(request());
    const [intent] = await intentRows();

    expect(intent?.['recipient_masked']).toBe('a***@vidu.com');
    expect(intent?.['recipient_masked']).not.toBe(RECIPIENT);
    expect(intent?.['correlation_id']).toBe('req-b01-0001');

    const params = intent?.['params'] as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(['reference', 'schemaVersion']);
    expect(Object.keys(params['reference'] as object).sort()).toEqual(['challengeId', 'kind']);

    const serialized = JSON.stringify(intent);
    expect(serialized).not.toContain(SYNTHETIC_SECRET);
    expect(serialized).not.toContain(RECIPIENT);
    for (const field of ['ciphertext', 'authTag', 'iv', 'secret', 'token']) {
      expect(serialized).not.toContain(field);
    }
  });

  it('persists no plaintext in the outbox payload', async () => {
    await useCase.request(request());
    const [event] = await outboxRows();
    const serialized = JSON.stringify(event?.payload);

    expect(serialized).not.toContain(SYNTHETIC_SECRET);
    expect(serialized).not.toContain(RECIPIENT);
    expect(serialized).not.toContain('VERIFICATION_CODE');
    expect(Object.keys(event?.payload ?? {}).sort()).toEqual([
      'algorithm',
      'authTag',
      'ciphertext',
      'iv',
      'version',
    ]);
  });

  it('collapses a duplicate request to one intent and one delivery event', async () => {
    const input = request();
    const first = await useCase.request(input);
    const second = await useCase.request(input);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('replay');
    expect(second.intentId).toBe(first.intentId);
    expect(second.intentKey).toBe(first.intentKey);

    expect(await intentRows()).toHaveLength(1);
    // The point of returning before sealing: no second envelope, no second event.
    expect(await outboxRows()).toHaveLength(1);
  });

  it.each([
    ['source event', { sourceEventId: 'challenge-0002' }],
    ['recipient', { normalizedRecipient: 'khac@vidu.com' }],
    ['template', { templateKey: 'secure-link.request-access' }],
  ])('treats a different %s as a different notification', async (_label, override) => {
    const first = await useCase.request(request());
    const second = await useCase.request(request(override));

    expect(second.outcome).toBe('created');
    expect(second.intentId).not.toBe(first.intentId);
    expect(second.intentKey).not.toBe(first.intentKey);
    expect(await intentRows()).toHaveLength(2);
    expect(await outboxRows()).toHaveLength(2);
  });

  it('seals a secure-link token through the same intake', async () => {
    const result = await useCase.request(
      request({
        sourceEventId: 'grant-0001',
        templateKey: 'secure-link.request-access',
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId: newId() },
        secretKind: 'SECURE_LINK_TOKEN',
        secret: 'synthetic-token-value-0001',
      }),
    );
    expect(result.outcome).toBe('created');

    const [intent] = await intentRows();
    const params = intent?.['params'] as Record<string, unknown>;
    expect(Object.keys(params['reference'] as object).sort()).toEqual(['grantId', 'kind']);
    expect(JSON.stringify(intent)).not.toContain('synthetic-token-value-0001');
  });
});
