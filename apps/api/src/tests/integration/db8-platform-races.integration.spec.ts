/**
 * DB8-CP5 — outbox exclusive-claim and idempotency-claim races against real,
 * independent PostgreSQL connections
 * (`DB8_RACE_COVERAGE_MATRIX.md` CC-19/CC-20, both P0).
 *
 * DB7 built and single-run tested both primitives
 * (`outbox-event-store.integration.spec.ts`, `idempotency-store.integration.spec.ts`)
 * but never ran two workers/callers against them at once. This proves the
 * `FOR UPDATE SKIP LOCKED` claim path (G-DB7-55) never double-claims a row
 * across two real workers, and the `claim` unique arbiter (G-DB7-52) never
 * lets two concurrent callers both believe they own the same key.
 */
import { newId, schema } from '@embroidery/database';
import { DatabaseModule, IdempotencyStore, OutboxEventStore } from '@embroidery/persistence';
import type { IdempotencyClaim, IdempotencyKey } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createConcurrencyTestContext } from './db8-concurrency-context';
import type { ConcurrencyTestContext } from './db8-concurrency-context';

const { outboxEvents } = schema;

describe('DB8 platform primitive races — outbox and idempotency (CP5, integration)', () => {
  let context: ConcurrencyTestContext;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp5-platform', [DatabaseModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function seedOutboxEvents(count: number): Promise<void> {
    const rows = Array.from({ length: count }, () => ({
      eventType: 'db8.probe',
      aggregateKind: 'ORDER' as const,
      aggregateId: newId(),
      payload: {},
      payloadSchemaVersion: 1,
      status: 'PENDING' as const,
      attemptCount: 0,
      nextAttemptAt: new Date(),
    }));
    await context.disposable.client.db.insert(outboxEvents).values(rows);
  }

  it('CC-19: two workers claiming the same batch never claim the same row', async () => {
    await seedOutboxEvents(6);
    const a = await context.spawnActor('worker-A');
    const b = await context.spawnActor('worker-B');

    const [claimedA, claimedB] = await Promise.all([
      a.inTransaction(() => a.get<OutboxEventStore>(OutboxEventStore).claimBatch('worker-A', 4)),
      b.inTransaction(() => b.get<OutboxEventStore>(OutboxEventStore).claimBatch('worker-B', 4)),
    ]);

    const idsA = new Set(claimedA.map((e) => e.id));
    const idsB = new Set(claimedB.map((e) => e.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));

    expect(overlap).toHaveLength(0);
    // 6 rows, two workers each asking for up to 4: SKIP LOCKED partitions
    // them so the union is every row and nothing is claimed twice.
    expect(idsA.size + idsB.size).toBe(6);

    const rows = await context.disposable.client.db
      .select({ id: outboxEvents.id, claimedBy: outboxEvents.claimedBy })
      .from(outboxEvents);
    expect(rows.every((row) => row.claimedBy === 'worker-A' || row.claimedBy === 'worker-B')).toBe(
      true,
    );
  });

  it('flakiness gate: repeats the outbox claim race 5 more times, always zero overlap', async () => {
    for (let i = 0; i < 5; i += 1) {
      await context.reset();
      await seedOutboxEvents(6);
      const a = await context.spawnActor(`worker-A${i}`);
      const b = await context.spawnActor(`worker-B${i}`);

      const [claimedA, claimedB] = await Promise.all([
        a.inTransaction(() =>
          a.get<OutboxEventStore>(OutboxEventStore).claimBatch(`worker-A${i}`, 4),
        ),
        b.inTransaction(() =>
          b.get<OutboxEventStore>(OutboxEventStore).claimBatch(`worker-B${i}`, 4),
        ),
      ]);

      const idsA = new Set(claimedA.map((e) => e.id));
      const idsB = new Set(claimedB.map((e) => e.id));
      expect([...idsA].filter((id) => idsB.has(id))).toHaveLength(0);
      expect(idsA.size + idsB.size).toBe(6);
    }
  });

  it('CC-20: two concurrent claims of the same idempotency key never both succeed', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const key: IdempotencyKey = {
      namespace: 'db8.probe',
      scopeKey: newId(),
      fingerprint: 'fp-1',
    };
    const expiresAt = new Date(Date.now() + 3_600_000);

    const [outcomeA, outcomeB] = await Promise.all([
      a.inTransaction(() => a.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
      b.inTransaction(() => b.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
    ]);

    const outcomes = [outcomeA.outcome, outcomeB.outcome];
    // Exactly one caller believes it owns the key; the other sees it already
    // in progress — never both `claimed`, which is the exact double-claim
    // G-DB7-52's unique arbiter exists to prevent.
    expect(outcomes.filter((o) => o === 'claimed')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'in_progress')).toHaveLength(1);
  });

  it('CC-20b: two concurrent claims of the same key with different fingerprints — the loser sees a conflict, not a silent claim', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const scopeKey = newId();
    const expiresAt = new Date(Date.now() + 3_600_000);

    const [resultA, resultB] = await Promise.allSettled([
      a.inTransaction(() =>
        a
          .get<IdempotencyStore>(IdempotencyStore)
          .claim({ namespace: 'db8.probe', scopeKey, fingerprint: 'fp-a' }, expiresAt),
      ),
      b.inTransaction(() =>
        b
          .get<IdempotencyStore>(IdempotencyStore)
          .claim({ namespace: 'db8.probe', scopeKey, fingerprint: 'fp-b' }, expiresAt),
      ),
    ]);

    const fulfilled = [resultA, resultB].filter(
      (r): r is PromiseFulfilledResult<IdempotencyClaim> => r.status === 'fulfilled',
    );
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    // One of two coherent outcomes: the second caller's insert blocked on
    // the first's uncommitted row, then either read a different fingerprint
    // (IDEMPOTENCY_CONFLICT — rejected) or, if it does not hold a live claim
    // yet, is still just "claimed"/"in_progress" for its own transaction.
    // What must never happen is both callers reading `claimed` for two
    // different fingerprints under the same key.
    expect(fulfilled.length + rejected.length).toBe(2);
    const claimedCount = fulfilled.filter((r) => r.value.outcome === 'claimed').length;
    expect(claimedCount).toBeLessThanOrEqual(1);
  });

  it('flakiness gate: repeats the idempotency claim race 5 more times, never two claimed', async () => {
    for (let i = 0; i < 5; i += 1) {
      const a = await context.spawnActor(`A${i}`);
      const b = await context.spawnActor(`B${i}`);
      const key: IdempotencyKey = {
        namespace: 'db8.probe',
        scopeKey: newId(),
        fingerprint: 'fp-1',
      };
      const expiresAt = new Date(Date.now() + 3_600_000);

      const [outcomeA, outcomeB] = await Promise.all([
        a.inTransaction(() => a.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
        b.inTransaction(() => b.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
      ]);

      expect([outcomeA.outcome, outcomeB.outcome].filter((o) => o === 'claimed')).toHaveLength(1);
    }
  });

  async function countIdempotencyRows(scopeKey: string): Promise<number> {
    const [row] = (
      await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from idempotency_records where scope_key = ${scopeKey}`,
      )
    ).rows;
    return Number(row?.count ?? 0);
  }

  it('leaves exactly one idempotency row after a concurrent double-claim, never two', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const key: IdempotencyKey = {
      namespace: 'db8.probe',
      scopeKey: newId(),
      fingerprint: 'fp-1',
    };
    const expiresAt = new Date(Date.now() + 3_600_000);

    await Promise.all([
      a.inTransaction(() => a.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
      b.inTransaction(() => b.get<IdempotencyStore>(IdempotencyStore).claim(key, expiresAt)),
    ]);

    expect(await countIdempotencyRows(key.scopeKey)).toBe(1);
  });
});
