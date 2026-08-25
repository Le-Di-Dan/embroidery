/**
 * `APP8-B03` §16.2/§16.3 — the production queue and job detail, against a real
 * PostgreSQL instance and through the real HTTP routes.
 *
 * The jobs these reads page over are created through B03's own creation route,
 * so the queue and detail are proved against rows the checkpoint itself wrote.
 * The one exception is the transition history: LC-18 moves belong to
 * `APP8-B04` and B03 publishes no route that could make one, so the two
 * transition rows here are written directly through the delivered
 * `ProductionJobRepository.transition` — the same writer B04 will use — because
 * an ordering claim about a history needs a history to order.
 */
import request from 'supertest';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import {
  PRODUCTION_JOB_REPOSITORY,
  type ProductionJobId,
  type ProductionJobRepository,
} from '../../domain/repositories/production-job.repository';
import {
  createAdminProductionContext,
  dataOf,
  ROUTES,
  type AdminProductionTestContext,
} from './admin-production-context';

interface QueuePayload {
  readonly items: readonly {
    readonly jobId: string;
    readonly orderId: string;
    readonly status: string;
    readonly createdAt: string;
    readonly startedAt?: string;
  }[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

interface DetailPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly status: string;
  readonly transitions: readonly {
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actorKind: string;
    readonly reason?: string;
  }[];
  readonly specification?: { readonly productName: string };
  readonly reservationSummary?: {
    readonly required: boolean;
    readonly reservations: readonly {
      readonly skuId: string;
      readonly quantity: number;
      readonly status: string;
    }[];
  };
}

describe('APP8-B03 — the Admin production reads (integration)', () => {
  let context: AdminProductionTestContext;
  let jobs: ProductionJobRepository;
  let transactions: TransactionManager;

  beforeAll(async () => {
    context = await createAdminProductionContext('app8-b03-reads');
    jobs = context.app.get<ProductionJobRepository>(PRODUCTION_JOB_REPOSITORY);
    transactions = context.app.get(TransactionManager);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const create = async (orderId: string): Promise<string> =>
    dataOf<{ jobId: string }>(
      await request(context.server())
        .post(ROUTES.create(orderId))
        .set('Cookie', context.adminCookie())
        .send({})
        .expect(201),
    ).jobId;

  const queue = (query = '') =>
    request(context.server()).get(`${ROUTES.queue()}${query}`).set('Cookie', context.adminCookie());

  const detail = (jobId: string) =>
    request(context.server()).get(ROUTES.detail(jobId)).set('Cookie', context.adminCookie());

  /** Three jobs, each on its own order, with pinned creation instants. */
  async function seedThreeJobs(): Promise<readonly [string, string, string]> {
    const ids: string[] = [];
    for (const [index, stamp] of [
      '2026-08-20T09:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
      '2026-08-22T09:00:00.000Z',
    ].entries()) {
      const order = await context.seedOrder({ fixture: await context.seedChain(`q${index}`) });
      const jobId = await create(order.orderId);
      await context.disposable.client.db.execute(
        sql`update production_jobs set created_at = ${stamp} where id = ${jobId}`,
      );
      ids.push(jobId);
    }
    return ids as unknown as readonly [string, string, string];
  }

  describe('the queue', () => {
    it('returns jobs newest first, deterministically', async () => {
      const [oldest, middle, newest] = await seedThreeJobs();

      const page = dataOf<QueuePayload>(await queue().expect(200));

      expect(page.items.map((item) => item.jobId)).toEqual([newest, middle, oldest]);
      expect(page.hasNext).toBe(false);
      expect(page.nextCursor).toBeUndefined();
    });

    it('pages without repeating or skipping a row at the boundary', async () => {
      const [oldest, middle, newest] = await seedThreeJobs();

      const first = dataOf<QueuePayload>(await queue('?limit=2').expect(200));
      expect(first.items.map((item) => item.jobId)).toEqual([newest, middle]);
      expect(first.hasNext).toBe(true);

      const second = dataOf<QueuePayload>(
        await queue(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`).expect(200),
      );
      expect(second.items.map((item) => item.jobId)).toEqual([oldest]);
      expect(second.hasNext).toBe(false);
    });

    it('filters by production status, and by more than one at once', async () => {
      const [oldest, , newest] = await seedThreeJobs();
      await transitionTo(newest, 'STARTED');

      const started = dataOf<QueuePayload>(await queue('?status=STARTED').expect(200));
      expect(started.items.map((item) => item.jobId)).toEqual([newest]);
      expect(started.items[0]?.startedAt).toBeDefined();

      const planned = dataOf<QueuePayload>(await queue('?status=PLANNED').expect(200));
      expect(planned.items.map((item) => item.jobId)).toContain(oldest);
      expect(planned.items.map((item) => item.jobId)).not.toContain(newest);

      const both = dataOf<QueuePayload>(await queue('?status=PLANNED&status=STARTED').expect(200));
      expect(both.items).toHaveLength(3);
    });

    it('narrows to one order when asked', async () => {
      const [, , newest] = await seedThreeJobs();
      const target = dataOf<QueuePayload>(await queue().expect(200)).items.find(
        (item) => item.jobId === newest,
      );

      const scoped = dataOf<QueuePayload>(
        await queue(`?orderId=${target?.orderId ?? ''}`).expect(200),
      );

      expect(scoped.items.map((item) => item.jobId)).toEqual([newest]);
    });

    it('publishes no invented priority, attempt, machine or operator field', async () => {
      await seedThreeJobs();

      const page = dataOf<QueuePayload>(await queue().expect(200));

      expect(Object.keys(page.items[0] ?? {}).sort()).toEqual(
        ['approvalSnapshotId', 'createdAt', 'jobId', 'orderId', 'status'].sort(),
      );
    });

    it('refuses a cursor it did not issue rather than silently restarting', async () => {
      await seedThreeJobs();

      await queue('?cursor=not-a-cursor').expect(400);
    });

    it('refuses an unknown query parameter', async () => {
      await queue('?priority=HIGH').expect(400);
    });

    it('is Admin-only', async () => {
      await request(context.server()).get(ROUTES.queue()).expect(401);
    });
  });

  describe('the detail', () => {
    it('reports the job, its frozen specification and its order code', async () => {
      const order = await context.seedOrder();
      const jobId = await create(order.orderId);

      const view = dataOf<DetailPayload>(await detail(jobId).expect(200));

      expect(view.jobId).toBe(jobId);
      expect(view.orderId).toBe(order.orderId);
      expect(view.orderCode).toBe(order.code);
      expect(view.status).toBe('PLANNED');
      expect(view.specification?.productName).toBe('Tee');
      // A PLANNED job has made no LC-18 move yet, so its history is empty
      // rather than carrying a synthetic creation row.
      expect(view.transitions).toEqual([]);
    });

    it('orders the transition history by the move that happened first', async () => {
      const order = await context.seedOrder();
      const jobId = await create(order.orderId);

      await transitionTo(jobId, 'STARTED');
      await transitionTo(jobId, 'CANCELLED', 'Machine fault');

      const view = dataOf<DetailPayload>(await detail(jobId).expect(200));

      expect(view.transitions.map((row) => `${row.fromStatus}->${row.toStatus}`)).toEqual([
        'PLANNED->STARTED',
        'STARTED->CANCELLED',
      ]);
      expect(view.transitions[1]?.reason).toBe('Machine fault');
      expect(view.transitions[0]?.actorKind).toBe('SYSTEM');
    });

    it('reports a Catalog order’s reservation truthfully, without deciding anything', async () => {
      const order = await context.seedOrder();
      const jobId = await create(order.orderId);
      await seedReservation(order.orderId, order.fixture.skuId, 25);

      const view = dataOf<DetailPayload>(await detail(jobId).expect(200));

      expect(view.reservationSummary?.required).toBe(true);
      expect(view.reservationSummary?.reservations).toHaveLength(1);
      const [reservation] = view.reservationSummary?.reservations ?? [];
      // The SKU an operator recognises, joined from the anchor — not the
      // anchor id alone, which no operator holds.
      expect(reservation?.skuId).toBe(order.fixture.skuId);
      expect(reservation?.quantity).toBe(25);
      expect(reservation?.status).toBe('RESERVED');
    });

    it('reports a Catalog order with no reservation as required-but-uncovered', async () => {
      const order = await context.seedOrder();
      const jobId = await create(order.orderId);

      const view = dataOf<DetailPayload>(await detail(jobId).expect(200));

      // Truthful, and deliberately not a verdict: whether production may start
      // is APP8-B04's decision, taken under the stock row lock.
      expect(view.reservationSummary?.required).toBe(true);
      expect(view.reservationSummary?.reservations).toEqual([]);
    });

    it('reports an unknown job as not found', async () => {
      await detail(newId()).expect(404);
    });

    it('refuses a malformed job id before touching the database', async () => {
      await detail('not-a-uuid').expect(400);
    });

    it('is Admin-only', async () => {
      const order = await context.seedOrder();
      const jobId = await create(order.orderId);

      await request(context.server()).get(ROUTES.detail(jobId)).expect(401);
    });
  });

  /**
   * A B04 move, made through the delivered writer.
   *
   * SYSTEM rather than ADMIN so the row needs no `admin_accounts` FK target
   * beyond the one the session already minted, and because what is under test
   * is the ordering of the history, not who made it.
   */
  async function transitionTo(jobId: string, to: string, reason?: string): Promise<void> {
    await transactions.runInTransaction(() =>
      jobs.transition({
        id: jobId as ProductionJobId,
        to: to as 'STARTED',
        actor: { kind: 'SYSTEM', systemJobKey: 'app8-b03-fixture' },
        correlationId: newId(),
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }

  /** An official reservation, written directly — B03 creates none. */
  async function seedReservation(orderId: string, skuId: string, quantity: number): Promise<void> {
    const stockId = newId();
    await context.disposable.client.db.execute(sql`
      insert into sku_stocks (id, sku_id, quantity_on_hand)
      values (${stockId}, ${skuId}, ${quantity})
    `);
    await context.disposable.client.db.execute(sql`
      insert into inventory_reservations (id, sku_stock_id, order_id, quantity, status)
      values (${newId()}, ${stockId}, ${orderId}, ${quantity}, 'RESERVED')
    `);
  }
});
