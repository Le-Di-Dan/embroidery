/**
 * `APP4-W01` — the delivery paths that end with the customer holding a secret.
 *
 * Everything runs against a disposable PostgreSQL through the real claim, the
 * real execution service and the real completion writes. The recording adapter
 * is the outbound sink, which is what makes "the retry delivered the identical
 * plaintext" an observation rather than an assertion about code.
 */
import { executeRaw, newId, sql } from '@embroidery/database';

import {
  DELIVERY_POLICY_VALUE,
  TEST_STOREFRONT_ORIGIN,
  seedDelivery,
  startNotificationWorker,
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

const [FIRST_DELAY] = DELIVERY_POLICY_VALUE.retryDelaysSeconds;

describe('APP4-W01 notification delivery — success paths', () => {
  let context: NotificationWorkerContext;

  beforeAll(async () => {
    context = await startNotificationWorker({
      label: 'app4_w01_success',
      deliveryPolicy: DELIVERY_POLICY_VALUE,
    });
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(() => {
    context.adapter.reset();
  });

  it('delivers one claimed job and satisfies its intent', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('SUCCEEDED');
    expect(context.adapter.records()).toHaveLength(1);
    expect(context.adapter.records()[0]).toMatchObject({
      channel: 'EMAIL',
      normalizedRecipient: 'recipient@example.com',
      secretKind: 'VERIFICATION_CODE',
      secret,
    });

    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('SATISFIED');
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      { channel: 'EMAIL', outcome: 'DELIVERED', errorClass: null, providerMessageRef: null },
    ]);

    // The generic runtime owns the rest, unchanged.
    const row = await outboxRow(context.disposable, seeded.outboxEventId);
    expect(row.status).toBe('DISPATCHED');
    expect(row.lastError).toBeNull();
    expect(await backgroundAttempts(context.disposable, seeded.outboxEventId)).toEqual([
      { attemptNo: 1, outcome: 'SUCCEEDED', errorClass: null },
    ]);

    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });

  it('delivers an SMS secure-link token as the raw token, in the fragment form', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, {
      secret,
      channel: 'SMS',
      secretKind: 'SECURE_LINK_TOKEN',
    });

    await context.runOnce();

    expect(context.adapter.records()[0]).toMatchObject({
      channel: 'SMS',
      normalizedRecipient: '+84900000001',
      secretKind: 'SECURE_LINK_TOKEN',
      secret,
    });

    // `APP4-B05` §13 — the outbound message carries the absolute fragment form,
    // composed from `STOREFRONT_PUBLIC_ORIGIN` at the sink.
    const link = context.adapter.records()[0]?.secureLinkUrl ?? '';
    expect(link).toBe(`${TEST_STOREFRONT_ORIGIN}/truy-cap#t=${secret}`);

    // The token sits *after* the `#`, and the part a server would ever see
    // carries neither the token nor any parameter. This is the assertion that
    // fails if a future edit moves the carrier to `?t=` or a path segment: the
    // link would still contain the token and still "work" in a browser.
    const [beforeFragment, fragment] = link.split('#');
    expect(beforeFragment).toBe(`${TEST_STOREFRONT_ORIGIN}/truy-cap`);
    expect(beforeFragment).not.toContain(secret);
    expect(beforeFragment).not.toContain('?');
    expect(fragment).toBe(`t=${secret}`);

    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      { channel: 'SMS', outcome: 'DELIVERED', errorClass: null, providerMessageRef: null },
    ]);
    // Neither the token nor the rendered URL reached any column. `secretAppears`
    // scans for the token itself, which the link contains as a substring, so one
    // sweep covers both.
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });

  it('renders no link for a verification code, leaving code delivery unchanged', async () => {
    // The regression guard for the §13 rule "do not alter verification-code
    // delivery semantics": the renderer is reached only by the secure-link
    // discriminator, so a code delivery neither composes a URL nor consults the
    // origin — and would keep working with the variable unset.
    const secret = `synthetic-${newId()}`;
    await seedDelivery(context, { secret });

    await context.runOnce();

    expect(context.adapter.records()[0]?.secretKind).toBe('VERIFICATION_CODE');
    expect(context.adapter.records()[0]?.secureLinkUrl).toBeUndefined();
  });

  it('sends nothing a second time when the intent is already SATISFIED', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });

    await context.runOnce();
    // The same logical job, claimed again: the row is forced back to claimable,
    // which is exactly the state an at-least-once redelivery produces.
    await forcePending(context, seeded.outboxEventId);
    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('SUCCEEDED');
    expect(context.adapter.records()).toHaveLength(1);
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toHaveLength(1);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('SATISFIED');
  });

  it('retries the same row with the same envelope and the same secret', async () => {
    const secret = `synthetic-${newId()}`;
    const seeded = await seedDelivery(context, { secret });
    context.adapter.program({ outcome: 'FAILED', retryable: true });
    const before = await counts(context);

    const first = await context.runOnce();

    expect(first?.outcome).toBe('FAILED_RETRYABLE');
    // The first policy delay, written by the completion itself.
    expect(await scheduledDelaySeconds(context.disposable, seeded.outboxEventId)).toBeCloseTo(
      FIRST_DELAY ?? 0,
      -1,
    );
    expect((await outboxRow(context.disposable, seeded.outboxEventId)).status).toBe('PENDING');
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('PROCESSING');

    await makeDueNow(context.disposable, seeded.outboxEventId);
    const second = await context.runOnce();

    expect(second?.outcome).toBe('SUCCEEDED');
    expect(second?.outboxEventId).toBe(seeded.outboxEventId);
    expect(context.adapter.records()).toHaveLength(2);
    const [attemptOne, attemptTwo] = context.adapter.records();
    // Same plaintext, because the same ciphertext was opened again. Nothing was
    // minted, reissued or re-sealed between the two attempts.
    expect(attemptTwo?.secret).toBe(secret);
    expect(attemptTwo?.secret).toBe(attemptOne?.secret);

    const row = await outboxRow(context.disposable, seeded.outboxEventId);
    expect(row.status).toBe('DISPATCHED');
    expect(row.attemptCount).toBe(2);
    expect(await intentStatus(context.disposable, seeded.intentId)).toBe('SATISFIED');
    expect(await deliveryAttempts(context.disposable, seeded.intentId)).toEqual([
      {
        channel: 'EMAIL',
        outcome: 'FAILED_RETRYABLE',
        errorClass: 'NOTIFICATION_TRANSPORT_UNAVAILABLE',
        providerMessageRef: null,
      },
      { channel: 'EMAIL', outcome: 'DELIVERED', errorClass: null, providerMessageRef: null },
    ]);
    // No new intent, no new event, no reissued secret — only the two attempts.
    expect(await counts(context)).toEqual(before);
    expect(await secretAppears(context.disposable, secret)).toEqual([]);
  });

  it('writes the secret to no log line, on success or on failure', async () => {
    // Both paths in one capture, because the failure path is the one that
    // tempts an author into "just log what we tried to send".
    const captured: string[] = [];
    const record = (chunk: unknown): boolean => {
      captured.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(record);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(record);

    const delivered = `synthetic-${newId()}`;
    const refused = `synthetic-${newId()}`;
    try {
      await seedDelivery(context, { secret: delivered });
      await context.runOnce();

      const failing = await seedDelivery(context, { secret: refused });
      context.adapter.program({ outcome: 'FAILED', retryable: false });
      await context.runOnce();
      expect((await outboxRow(context.disposable, failing.outboxEventId)).status).toBe(
        'DEAD_LETTER',
      );
    } finally {
      out.mockRestore();
      err.mockRestore();
    }

    const log = captured.join('');
    expect(log).not.toContain(delivered);
    expect(log).not.toContain(refused);
    expect(log).not.toContain('recipient@example.com');
  });

  it('updates the intent named by the linkage, never the lineage id', async () => {
    // The `APP4-B08` shape: an envelope whose ciphertext still names the origin
    // intent, carried by an event whose aggregate linkage names a *different*,
    // current one. A consumer reading `originNotificationIntentId` would settle
    // the wrong row — and would have passed every test above, where the two ids
    // are the same value.
    const origin = await seedDelivery(context, {
      secret: `synthetic-${newId()}`,
      skipEvent: true,
    });
    const secret = `synthetic-${newId()}`;
    const replay = await seedDelivery(context, { secret, originIntentId: origin.intentId });

    const summary = await context.runOnce();

    expect(summary?.outboxEventId).toBe(replay.outboxEventId);
    expect(summary?.outcome).toBe('SUCCEEDED');
    // The copied envelope still delivered.
    expect(context.adapter.records()[0]?.secret).toBe(secret);

    expect(await intentStatus(context.disposable, replay.intentId)).toBe('SATISFIED');
    expect(await deliveryAttempts(context.disposable, replay.intentId)).toHaveLength(1);
    // The origin was not touched: same state, no attempt, no settle.
    expect(await intentStatus(context.disposable, origin.intentId)).toBe('PENDING');
    expect(await deliveryAttempts(context.disposable, origin.intentId)).toEqual([]);
  });
});

/** Forces a completed row back to claimable, standing in for a redelivery. */
async function forcePending(
  context: NotificationWorkerContext,
  outboxEventId: bigint,
): Promise<void> {
  await executeRaw(
    context.disposable.client.db,
    sql`
      UPDATE outbox_events
      SET status = 'PENDING', dispatched_at = NULL, next_attempt_at = NULL
      WHERE id = ${outboxEventId}
    `,
  );
}

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
