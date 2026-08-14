/**
 * `APP4-W01` — the delivery paths that end without a delivery.
 *
 * Every one of them has the same two obligations: the secret must not leak into
 * anything persisted, and the terminal evidence must stay terminal. The suite
 * asserts both every time rather than trusting that a path proven safe once
 * stays safe when its classification changes.
 *
 * The exhaustion test is the reason this harness drives attempts by hand: it
 * proves a `[60, 300]`-second schedule and a three-attempt bound in under a
 * second, by reading the delay the completion wrote and then moving the row's
 * own due instant forward.
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import { sealDeliveryEnvelope } from '@embroidery/notification-delivery';

import {
  DELIVERY_POLICY_VALUE,
  publishDeliveryPolicy,
  seedDelivery,
  startNotificationWorker,
  syntheticEnvelopeKey,
  type NotificationWorkerContext,
} from './notification-delivery-context';
import {
  backgroundAttempts,
  deliveryAttempts,
  intentStatus,
  makeDueNow,
  outboxRow,
  scheduledDelaySeconds,
  secretAppears,
} from './notification-delivery-queries';

const { maxAttempts: MAX_ATTEMPTS, retryDelaysSeconds: DELAYS } = DELIVERY_POLICY_VALUE;

describe('APP4-W01 notification delivery — failure paths', () => {
  let context: NotificationWorkerContext;

  beforeAll(async () => {
    context = await startNotificationWorker({
      label: 'app4_w01_failure',
      deliveryPolicy: DELIVERY_POLICY_VALUE,
    });
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(() => {
    context.adapter.reset();
  });

  it('stops at the policy budget, on the policy schedule, and dead-letters', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });
    context.adapter.program(
      ...Array.from({ length: MAX_ATTEMPTS + 1 }, () => ({
        outcome: 'FAILED' as const,
        retryable: true,
      })),
    );

    const observedDelays: number[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const summary = await context.runOnce();
      expect(summary?.attemptNo).toBe(attempt);
      if (attempt < MAX_ATTEMPTS) {
        expect(summary?.outcome).toBe('FAILED_RETRYABLE');
        observedDelays.push(await scheduledDelaySeconds(context.disposable, seeded.outboxEventId));
        await makeDueNow(context.disposable, seeded.outboxEventId);
      } else {
        expect(summary?.outcome).toBe('FAILED_TERMINAL');
      }
    }

    // The published schedule, not the global bounded-exponential one — the
    // runtime policy in this harness allows only two attempts and a 10 ms base.
    expect(observedDelays.map((delay) => Math.round(delay / 10) * 10)).toEqual(DELAYS);
    expect(context.adapter.records()).toHaveLength(MAX_ATTEMPTS);

    const attempts = await deliveryAttempts(context.disposable, seeded.intentId);
    expect(attempts).toHaveLength(MAX_ATTEMPTS);
    expect(attempts.at(-1)?.outcome).toBe('FAILED_TERMINAL');
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('FAILED');

    const row = await outboxRow(context.disposable, seeded.outboxEventId);
    expect(row.status).toBe('DEAD_LETTER');
    expect(row.nextAttemptAt).toBeNull();

    // Not claimable afterwards, and no fourth send.
    expect(await context.runOnce()).toBeUndefined();
    expect(context.adapter.records()).toHaveLength(MAX_ATTEMPTS);
    expect((await outboxRow(context.disposable, seeded.outboxEventId)).status).toBe('DEAD_LETTER');
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });

  it('does not retry a non-retryable transport refusal', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });
    context.adapter.program({ outcome: 'FAILED', retryable: false });

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('FAILED_TERMINAL');
    expect(summary?.attemptNo).toBe(1);
    expect(context.adapter.records()).toHaveLength(1);
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      {
        channel: 'EMAIL',
        outcome: 'FAILED_TERMINAL',
        errorClass: 'NOTIFICATION_TRANSPORT_REJECTED',
        providerMessageRef: null,
      },
    ]);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('FAILED');
    expect((await outboxRow(context.disposable, seeded.outboxEventId)).status).toBe('DEAD_LETTER');
    expect(await context.runOnce()).toBeUndefined();
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });

  it('never calls the channel when the envelope does not authenticate', async () => {
    // Sealed under a different key: structurally perfect, cryptographically
    // foreign. GCM's tag check is the only thing that can tell the difference,
    // and its failure must not become a "probably fine".
    const secret = `synthetic-${newId()}`;
    const foreign = syntheticEnvelopeKey();
    const tampered = sealDeliveryEnvelope(foreign.key, {
      secretKind: 'VERIFICATION_CODE',
      originNotificationIntentId: newId(),
      channel: 'EMAIL',
      normalizedRecipient: 'recipient@example.com',
      secret,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    const seeded = await seedDelivery(context, { secret, envelope: tampered });

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('FAILED_TERMINAL');
    expect(context.adapter.records()).toHaveLength(0);
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      {
        channel: 'EMAIL',
        outcome: 'FAILED_TERMINAL',
        errorClass: 'NOTIFICATION_ENVELOPE_UNREADABLE',
        providerMessageRef: null,
      },
    ]);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('FAILED');

    // Only bounded classes reached the ledgers — no exception text, no
    // ciphertext, no key fragment.
    expect(await backgroundAttempts(context.disposable, seeded.outboxEventId)).toEqual([
      { attemptNo: 1, outcome: 'FAILED_TERMINAL', errorClass: 'JOB_PAYLOAD_INVALID' },
    ]);
    expect((await outboxRow(context.disposable, seeded.outboxEventId)).lastError).toBe(
      'JOB_PAYLOAD_INVALID',
    );
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
    expect(await secretAppears(context.disposable, tampered.ciphertext)).toEqual([]);
    expect(await secretAppears(context.disposable, tampered.authTag)).toEqual([]);
  });

  it('does not send expired delivery material and mints nothing to replace it', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, {
      secret,
      issuedAt: new Date(Date.now() - 1_200_000),
      expiresAt: new Date(Date.now() - 600_000),
    });
    const before = await counts(context);

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('FAILED_TERMINAL');
    expect(context.adapter.records()).toHaveLength(0);
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      {
        channel: 'EMAIL',
        outcome: 'FAILED_TERMINAL',
        errorClass: 'NOTIFICATION_MATERIAL_EXPIRED',
        providerMessageRef: null,
      },
    ]);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('FAILED');
    expect((await outboxRow(context.disposable, seeded.outboxEventId)).status).toBe('DEAD_LETTER');
    // No reissue, no business resend, no replacement intent or event.
    expect(await counts(context)).toEqual(before);
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });
});

describe('APP4-W01 notification delivery — unpublished policy', () => {
  let context: NotificationWorkerContext;

  beforeAll(async () => {
    context = await startNotificationWorker({ label: 'app4_w01_nopolicy' });
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(() => {
    context.adapter.reset();
  });

  it('sends nothing until the policy exists, then delivers unchanged', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });

    const blocked = await context.runOnce();

    expect(blocked?.outcome).toBe('FAILED_RETRYABLE');
    expect(blocked?.errorClass).toBe('JOB_DEPENDENCY_UNAVAILABLE');
    expect(context.adapter.records()).toHaveLength(0);
    // Nothing was decided about the intent either: an unconfigured worker has
    // no opinion to record.
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([]);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('PENDING');

    await publishDeliveryPolicy(context, DELIVERY_POLICY_VALUE);
    await makeDueNow(context.disposable, seeded.outboxEventId);
    const delivered = await context.runOnce();

    expect(delivered?.outcome).toBe('SUCCEEDED');
    expect(context.adapter.records()).toHaveLength(1);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('SATISFIED');
  });

  it('sends nothing when the published policy is malformed', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });
    // A budget of three with one delay: the operator's two statements disagree,
    // and guessing which one they meant is worse than refusing both.
    await publishDeliveryPolicy(context, { maxAttempts: 3, retryDelaysSeconds: [60] });

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('FAILED_RETRYABLE');
    expect(context.adapter.records()).toHaveLength(0);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('PENDING');
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });
});

async function counts(
  context: NotificationWorkerContext,
): Promise<{ intents: number; events: number }> {
  const rows = await executeRaw<{ intents: number; events: number }>(
    context.disposable.client.db,
    sql`
      SELECT
        (SELECT count(*)::int FROM notification_intents) AS intents,
        (SELECT count(*)::int FROM outbox_events) AS events
    `,
  );
  return { intents: Number(rows[0]?.intents ?? -1), events: Number(rows[0]?.events ?? -1) };
}
