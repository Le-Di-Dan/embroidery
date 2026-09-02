/**
 * `APP12-B02` — the two races Ready-Made order creation has to survive
 * (`APP12-B02` §30, §31; `BR-022`, `BR-023`).
 *
 * ### They are real races, not simulated ones
 *
 * Every pair below is issued without awaiting the first, against the real
 * application and one real PostgreSQL, over separate pooled connections. There
 * is no mocked mutex, no injected barrier and no serialisation helper: the
 * arbiters under test are the `sku_stocks` row lock (GRD-014) and
 * `uq_idempotency_records__namespace_scope_key`, and a test that arranged the
 * ordering itself would be asserting its own arrangement.
 *
 * ### What is asserted
 *
 * Committed rows, not response bodies. A race is proved by what the database
 * holds afterwards — `committed reservations <= available` is the oversell
 * property, and `orders = 1` is the idempotency property. The responses are
 * asserted only where the contract fixes them.
 *
 * Each race is deterministic and run once. Looping them dozens of times would
 * trade a clear proof for a flaky one.
 */
import { sql } from 'drizzle-orm';

import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  createBody,
  seedAnotherChallenge,
  seedReadyMadeContext,
  type ReadyMadeFixture,
} from '../support/ready-made-order-fixture';

const CREATE_PATH = '/api/public/ready-made-orders';

interface Envelope {
  readonly code?: string;
  readonly data?: Record<string, unknown>;
}

interface Outcome {
  readonly status: number;
  readonly body: Envelope;
}

describe('APP12-B02 Ready-Made order concurrency', () => {
  let context: ApiIntegrationTestContext;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b02_race');
    // `APP12-B04` composed the ORDER_ACCESS grant issuer into order creation, so
    // the fail-closed `secure_grant` policy is now on the Wave-1 checkout path:
    // without a published version this command refuses rather than committing an
    // order its own customer could never open.
    await publishSecureAccessPolicies(context.app, context.database);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const db = () => context.database.client.db;

  const send = (body: unknown): Promise<Outcome> =>
    context.http
      .post(CREATE_PATH)
      .send(body as object)
      .then((response) => ({ status: response.status, body: response.body as Envelope }));

  /** What actually committed against one SKU's anchor. */
  async function committed(fixture: ReadyMadeFixture): Promise<{
    orders: number;
    reservations: number;
    reservedTotal: number;
    onHand: number;
  }> {
    const rows = await db().execute<{
      orders: string;
      reservations: string;
      reserved_total: string;
      on_hand: number;
    }>(sql`
      select (select count(*) from orders o
               where o.customer_id = ${fixture.customerId} and o.origin = 'READY_MADE') as orders,
             (select count(*) from inventory_reservations r
                join sku_stocks s on s.id = r.sku_stock_id
               where s.sku_id = ${fixture.skuId} and r.status = 'RESERVED') as reservations,
             (select coalesce(sum(r.quantity), 0) from inventory_reservations r
                join sku_stocks s on s.id = r.sku_stock_id
               where s.sku_id = ${fixture.skuId} and r.status = 'RESERVED') as reserved_total,
             (select s.quantity_on_hand from sku_stocks s
               where s.sku_id = ${fixture.skuId}) as on_hand
    `);
    const row = rows.rows[0];
    return {
      orders: Number(row?.orders),
      reservations: Number(row?.reservations),
      reservedTotal: Number(row?.reserved_total),
      onHand: Number(row?.on_hand),
    };
  }

  describe('oversell — two orders that cannot both fit', () => {
    let fixture: ReadyMadeFixture;
    let outcomes: readonly Outcome[];
    const AVAILABLE = 4;

    beforeAll(async () => {
      fixture = await seedReadyMadeContext(context.database, {
        label: 'oversell',
        quantityOnHand: AVAILABLE,
      });
      // Two different verified challenges: two genuinely separate purchases,
      // so idempotency cannot be what resolves this. Only the anchor lock can.
      const second = await seedAnotherChallenge(context.database, fixture);

      outcomes = await Promise.all([
        send(createBody(fixture, { quantity: AVAILABLE })),
        send(createBody(fixture, { challengeId: second, quantity: AVAILABLE })),
      ]);
    });

    it('lets exactly one succeed', () => {
      const created = outcomes.filter((outcome) => outcome.status === 201);
      expect(created).toHaveLength(1);
    });

    it('refuses exactly one for insufficient stock', () => {
      const refused = outcomes.filter((outcome) => outcome.status === 422);
      expect(refused).toHaveLength(1);
      expect(refused[0]?.body.code).toBe('INSUFFICIENT_STOCK');
    });

    it('commits one order and one reservation, never more than is available', async () => {
      const state = await committed(fixture);
      expect(state.orders).toBe(1);
      expect(state.reservations).toBe(1);
      expect(state.reservedTotal).toBe(AVAILABLE);
      expect(state.reservedTotal).toBeLessThanOrEqual(AVAILABLE);
      // A reservation commits stock; it does not issue it.
      expect(state.onHand).toBe(AVAILABLE);
    });

    it('leaves no orphan order for the refused request', async () => {
      const orphans = await db().execute<{ n: string }>(sql`
        select count(*) as n from orders o
         where o.customer_id = ${fixture.customerId}
           and not exists (select 1 from inventory_reservations r where r.order_id = o.id)
      `);
      expect(Number(orphans.rows[0]?.n)).toBe(0);
    });
  });

  describe('two orders that both fit', () => {
    let fixture: ReadyMadeFixture;
    let outcomes: readonly Outcome[];
    const AVAILABLE = 10;

    beforeAll(async () => {
      fixture = await seedReadyMadeContext(context.database, {
        label: 'bothfit',
        quantityOnHand: AVAILABLE,
      });
      const second = await seedAnotherChallenge(context.database, fixture);

      outcomes = await Promise.all([
        send(createBody(fixture, { quantity: 4 })),
        send(createBody(fixture, { challengeId: second, quantity: 6 })),
      ]);
    });

    it('lets both succeed', () => {
      expect(outcomes.map((outcome) => outcome.status)).toEqual([201, 201]);
    });

    it('commits two reservations totalling exactly the available quantity', async () => {
      const state = await committed(fixture);
      expect(state.orders).toBe(2);
      expect(state.reservations).toBe(2);
      expect(state.reservedTotal).toBe(AVAILABLE);
      expect(state.onHand).toBe(AVAILABLE);
    });
  });

  describe('the same idempotency key, raced', () => {
    let fixture: ReadyMadeFixture;
    let outcomes: readonly Outcome[];

    beforeAll(async () => {
      fixture = await seedReadyMadeContext(context.database, {
        label: 'samekey',
        quantityOnHand: 10,
      });
      const body = createBody(fixture, { quantity: 2 });
      // The same challenge, the same canonical fingerprint, two connections,
      // one arbiter.
      outcomes = await Promise.all([send(body), send(body)]);
    });

    /**
     * Either canonical outcome is accepted for the loser — the completed-replay
     * `201` carrying the *same* result, or the retryable in-progress `409` —
     * because which one it sees depends on how PostgreSQL resolves a
     * speculative insert against an uncommitted conflicting row. That is the
     * database's decision, not this endpoint's, and pinning it would make this
     * suite a test of PostgreSQL.
     */
    it('answers both callers canonically, and never with a uniqueness error', () => {
      const statuses = outcomes.map((outcome) => outcome.status).sort();
      expect(statuses[0]).toBe(201);
      expect([201, 409]).toContain(statuses[1]);

      const serialized = JSON.stringify(outcomes);
      expect(serialized).not.toContain('duplicate key');
      expect(serialized).not.toContain('uq_');
      expect(serialized).not.toContain('23505');
    });

    it('serves the same result to a replaying caller', () => {
      const replays = outcomes.filter((outcome) => outcome.status === 201);
      if (replays.length === 2) {
        expect(replays[0]?.body.data).toEqual(replays[1]?.body.data);
      } else {
        expect(replays[0]?.body.code).toBe('READY_MADE_ORDER_CREATED');
      }
    });

    it('commits exactly one order, one line, one reservation and one shipping detail', async () => {
      const state = await committed(fixture);
      expect(state.orders).toBe(1);
      expect(state.reservations).toBe(1);
      expect(state.reservedTotal).toBe(2);

      const children = await db().execute<{ items: string; shipping: string; events: string }>(sql`
        select (select count(*) from order_items i
                  join orders o on o.id = i.order_id
                 where o.customer_id = ${fixture.customerId}) as items,
               (select count(*) from shipping_details d
                  join orders o on o.id = d.order_id
                 where o.customer_id = ${fixture.customerId}) as shipping,
               (select count(*) from outbox_events e
                  join orders o on o.id::text = e.aggregate_id
                 where o.customer_id = ${fixture.customerId}) as events
      `);
      expect(Number(children.rows[0]?.items)).toBe(1);
      expect(Number(children.rows[0]?.shipping)).toBe(1);
      expect(Number(children.rows[0]?.events)).toBe(1);
    });
  });
});
