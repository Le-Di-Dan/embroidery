/**
 * The two `APP6-B02` Admin reads against a real PostgreSQL instance.
 *
 * The properties below are only observable against real rows: that a version
 * drafted three revisions ago still reads with the amounts, the adjustment
 * reason and the deposit share it was priced at, that addressing version 2
 * returns version 2's lines rather than the current version's, and — the
 * negative the checkpoint rests on — that reading changes nothing.
 *
 * The queries are exercised directly rather than over HTTP: the guard
 * composition and the published shape are presentation facts the contract suite
 * proves against the committed document, while what needs a database here is
 * that the archive survives being appended to.
 *
 * ### The fixture uses persistence, never `APP6-B03`
 *
 * A `SENT` and a `SUPERSEDED` version are seeded through
 * `QuotationRepository.send`, the DB7-CP4 persistence operation delivered long
 * before this phase. There is no application send yet and this suite does not
 * invent one: it needs legal historical *rows*, not the transaction that will
 * eventually produce them.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OrderModule } from '../../../order/order.module';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { ReadQuotationVersionDetail } from '../../application/reads/read-quotation-version-detail.query';
import { ReadQuotationVersionHistory } from '../../application/reads/read-quotation-version-history.query';
import { isQuotationReadError } from '../../domain/reads/quotation-read.errors';
import { QuotationModule } from '../../quotation.module';
import {
  QUOTATION_REPOSITORY,
  type AddQuotationVersionInput,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('APP6-B02 quotation read (integration)', () => {
  let context: PersistenceTestContext;
  let quotations: QuotationRepository;
  let requests: CustomRequestRepository;
  let history: ReadQuotationVersionHistory;
  let detail: ReadQuotationVersionDetail;
  let customerId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app6-b02-read', [OrderModule, QuotationModule]);
    requests = context.get(CUSTOM_REQUEST_REPOSITORY);
    quotations = context.get(QUOTATION_REPOSITORY);
    // The real repository, from the container. Both queries hold nothing else.
    history = new ReadQuotationVersionHistory(quotations);
    detail = new ReadQuotationVersionDetail(quotations);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    customerId = newId();
    await context.disposable.client.db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);
  });

  async function seedRequest(): Promise<CustomRequestId> {
    const id = newId() as CustomRequestId;
    await context.inTransaction(() =>
      requests.submit({
        id,
        code: `REQ-${id}`,
        customerId,
        breakdown: [{ productVariantId: undefined, sizeLabel: 'M', quantity: 10 }],
      }),
    );
    return id;
  }

  async function seedQuotation(): Promise<QuotationId> {
    const requestId = await seedRequest();
    const id = newId() as QuotationId;
    await context.inTransaction(() => quotations.createForRequest(id, `QUO-${id}`, requestId));
    return id;
  }

  /**
   * One priced version, distinct from every other by construction: the caller
   * chooses the unit price, so no two versions in a fixture share amounts and an
   * assertion cannot pass by reading the wrong row.
   */
  function versionInput(
    quotationId: QuotationId,
    unitPrice: number,
    overrides: Partial<AddQuotationVersionInput> = {},
  ): AddQuotationVersionInput {
    const subtotal = (unitPrice * 10).toFixed(2);
    const total = (unitPrice * 10 + 50_000).toFixed(2);
    const deposit = Math.round((unitPrice * 10 + 50_000) * 0.4).toFixed(2);
    const remaining = (unitPrice * 10 + 50_000 - Number(deposit)).toFixed(2);
    return {
      id: newId() as QuotationVersionId,
      quotationId,
      quantityTotal: 10,
      stitchCount: 8_500,
      subtotalAmount: subtotal,
      manualAdjustmentAmount: '0',
      adjustmentReason: undefined,
      shippingFeeAmount: '50000.00',
      totalAmount: total,
      depositPercent: '40.00',
      depositAmount: deposit,
      remainingAmount: remaining,
      lineItems: [
        {
          position: 1,
          lineKind: 'PRODUCT',
          description: `Polo at ${unitPrice}`,
          skuId: undefined,
          quantity: 10,
          unitPriceAmount: unitPrice.toFixed(2),
          lineTotalAmount: subtotal,
        },
      ],
      ...overrides,
    };
  }

  async function addVersion(
    quotationId: QuotationId,
    unitPrice: number,
    overrides: Partial<AddQuotationVersionInput> = {},
  ): Promise<QuotationVersionId> {
    const input = versionInput(quotationId, unitPrice, overrides);
    await context.inTransaction(() => quotations.addVersion(input));
    return input.id;
  }

  async function failureOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      if (isQuotationReadError(error)) {
        return error.failure;
      }
      throw error;
    }
    throw new Error('Expected the read to fail, but it succeeded.');
  }

  describe('version history', () => {
    it('returns every version of the quotation in version order', async () => {
      const quotationId = await seedQuotation();
      await addVersion(quotationId, 100_000);
      await addVersion(quotationId, 120_000);
      await addVersion(quotationId, 90_000);

      const view = await history.read(quotationId);

      expect(view.versions.map((v) => v.version)).toEqual([1, 2, 3]);
      // Ascending by version is chronology, and the amounts prove the order is
      // not merely sorted numbers: version 3 is the cheapest, so a sort on any
      // amount would produce a different sequence.
      expect(view.versions.map((v) => v.subtotalAmount)).toEqual([
        '1000000.00',
        '1200000.00',
        '900000.00',
      ]);
    });

    it('carries the quotation header the versions belong to', async () => {
      const quotationId = await seedQuotation();
      await addVersion(quotationId, 100_000);

      const view = await history.read(quotationId);

      expect(view.quotation.quotationId).toBe(quotationId);
      expect(view.quotation.quotationCode).toMatch(/^QUO-/);
      expect(view.quotation.quotationStatus).toBe('DRAFT');
      // Never sent, so no version is current — reported as absent rather than
      // guessed from the highest version number.
      expect(view.quotation.currentVersionId).toBeUndefined();
      expect(view.versions.every((v) => v.current === false)).toBe(true);
    });

    it('returns an empty history for a quotation with no versions', async () => {
      const quotationId = await seedQuotation();

      const view = await history.read(quotationId);

      expect(view.versions).toEqual([]);
      expect(view.quotation.quotationId).toBe(quotationId);
    });

    it('refuses a quotation that does not exist', async () => {
      expect(await failureOf(() => history.read(newId() as QuotationId))).toBe(
        'QUOTATION_NOT_FOUND',
      );
    });

    it('lists versions of this quotation only', async () => {
      const mine = await seedQuotation();
      const theirs = await seedQuotation();
      await addVersion(mine, 100_000);
      await addVersion(theirs, 777_000);

      const view = await history.read(mine);

      expect(view.versions).toHaveLength(1);
      expect(view.versions[0]?.subtotalAmount).toBe('1000000.00');
    });
  });

  describe('exact version detail', () => {
    it('returns the addressed version and its own lines, not the latest', async () => {
      const quotationId = await seedQuotation();
      const first = await addVersion(quotationId, 100_000);
      await addVersion(quotationId, 250_000);

      const view = await detail.read(quotationId, first);

      expect(view.version.versionId).toBe(first);
      expect(view.version.version).toBe(1);
      expect(view.version.totalAmount).toBe('1050000.00');
      expect(view.lineItems).toHaveLength(1);
      expect(view.lineItems[0]?.unitPriceAmount).toBe('100000.00');
      expect(view.lineItems[0]?.description).toBe('Polo at 100000');
    });

    it('orders line items by position', async () => {
      const quotationId = await seedQuotation();
      const versionId = newId() as QuotationVersionId;
      const input = versionInput(quotationId, 100_000, {
        id: versionId,
        // Deliberately inserted out of order: a read that returned insertion
        // order rather than position would pass every other assertion here.
        lineItems: [
          {
            position: 3,
            lineKind: 'SHIPPING',
            description: 'Delivery',
            skuId: undefined,
            quantity: 1,
            unitPriceAmount: '0.00',
            lineTotalAmount: '0.00',
          },
          {
            position: 1,
            lineKind: 'PRODUCT',
            description: 'Polo',
            skuId: undefined,
            quantity: 10,
            unitPriceAmount: '100000.00',
            lineTotalAmount: '1000000.00',
          },
          {
            position: 2,
            lineKind: 'DIGITIZING_FEE',
            description: 'Digitizing',
            skuId: undefined,
            quantity: 1,
            unitPriceAmount: '0.00',
            lineTotalAmount: '0.00',
          },
        ],
      });
      await context.inTransaction(() => quotations.addVersion(input));

      const view = await detail.read(quotationId, versionId);

      expect(view.lineItems.map((l) => l.position)).toEqual([1, 2, 3]);
      expect(view.lineItems.map((l) => l.lineKind)).toEqual([
        'PRODUCT',
        'DIGITIZING_FEE',
        'SHIPPING',
      ]);
    });

    it('refuses a version that belongs to another quotation', async () => {
      const mine = await seedQuotation();
      const theirs = await seedQuotation();
      await addVersion(mine, 100_000);
      const foreign = await addVersion(theirs, 777_000);

      // The row exists and `loadVersion` finds it; only the containment check
      // stops one quotation's URL from serving another's price.
      expect(await failureOf(() => detail.read(mine, foreign))).toBe('QUOTATION_VERSION_NOT_FOUND');
    });

    it('gives the same answer for a version that does not exist at all', async () => {
      const quotationId = await seedQuotation();
      await addVersion(quotationId, 100_000);

      expect(await failureOf(() => detail.read(quotationId, newId() as QuotationVersionId))).toBe(
        'QUOTATION_VERSION_NOT_FOUND',
      );
    });

    it('refuses a quotation that does not exist before looking at the version', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);

      expect(await failureOf(() => detail.read(newId() as QuotationId, versionId))).toBe(
        'QUOTATION_NOT_FOUND',
      );
    });
  });

  describe('historical explainability', () => {
    it('leaves an earlier version untouched when later versions are added', async () => {
      const quotationId = await seedQuotation();
      const first = await addVersion(quotationId, 100_000, {
        manualAdjustmentAmount: '-100000.00',
        adjustmentReason: 'Khách quen — giảm giá đợt đầu',
        totalAmount: '950000.00',
        depositPercent: '30.00',
        depositAmount: '285000.00',
        remainingAmount: '665000.00',
        stitchCount: 4_200,
      });

      const before = await detail.read(quotationId, first);

      await addVersion(quotationId, 300_000);
      await addVersion(quotationId, 400_000);

      const after = await detail.read(quotationId, first);

      expect(after).toEqual(before);
      // Named individually as well, so a future change that made `toEqual`
      // compare two equally-wrong objects still fails here.
      expect(after.version.manualAdjustmentAmount).toBe('-100000.00');
      expect(after.version.adjustmentReason).toBe('Khách quen — giảm giá đợt đầu');
      expect(after.version.totalAmount).toBe('950000.00');
      expect(after.version.stitchCount).toBe(4_200);
      expect(after.lineItems[0]?.unitPriceAmount).toBe('100000.00');
    });

    it('reports the deposit share the version was priced at, not the one in force now', async () => {
      const quotationId = await seedQuotation();
      const oldPolicy = await addVersion(quotationId, 100_000, {
        depositPercent: '30.00',
        depositAmount: '315000.00',
        remainingAmount: '735000.00',
      });
      const newPolicy = await addVersion(quotationId, 100_000, {
        depositPercent: '50.00',
        depositAmount: '525000.00',
        remainingAmount: '525000.00',
      });

      const view = await history.read(quotationId);

      expect(view.versions.map((v) => v.depositPercent)).toEqual(['30.00', '50.00']);
      expect((await detail.read(quotationId, oldPolicy)).version.depositPercent).toBe('30.00');
      expect((await detail.read(quotationId, newPolicy)).version.depositPercent).toBe('50.00');
    });

    it('keeps a superseded version readable with the facts it was sent under', async () => {
      const quotationId = await seedQuotation();
      const first = await addVersion(quotationId, 100_000);
      const second = await addVersion(quotationId, 200_000);

      const sentAt = new Date(Date.now() - HOUR_MS);
      const validUntil = new Date(Date.now() + HOUR_MS);
      await context.inTransaction(() => quotations.send(first, validUntil, sentAt));
      await context.inTransaction(() => quotations.send(second, validUntil, new Date()));

      const superseded = await detail.read(quotationId, first);

      expect(superseded.version.status).toBe('SUPERSEDED');
      expect(superseded.version.sentAt?.toISOString()).toBe(sentAt.toISOString());
      expect(superseded.version.validUntil?.toISOString()).toBe(validUntil.toISOString());
      expect(superseded.version.supersededAt).toBeInstanceOf(Date);
      // Superseded and still priced exactly as it was sent.
      expect(superseded.version.totalAmount).toBe('1050000.00');
      // And the pointer moved to the newer one, so `current` is false here and
      // true there — read from the header, not inferred from the status.
      expect(superseded.version.current).toBe(false);
      expect((await detail.read(quotationId, second)).version.current).toBe(true);
    });

    it('publishes a not-yet-reached fact as absent rather than as a value', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);

      const view = await detail.read(quotationId, versionId);

      expect(view.version.status).toBe('DRAFT');
      expect(view.version.sentAt).toBeUndefined();
      expect(view.version.validFrom).toBeUndefined();
      expect(view.version.validUntil).toBeUndefined();
      expect(view.version.acceptedAt).toBeUndefined();
      expect(view.version.supersededAt).toBeUndefined();
      expect(view.version.expiredAt).toBeUndefined();
      expect(view.version.adjustmentReason).toBeUndefined();
      expect(view.version.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('exact money', () => {
    it('returns every amount as a string, from both reads', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);

      const listed = (await history.read(quotationId)).versions[0]!;
      const read = await detail.read(quotationId, versionId);

      for (const version of [listed, read.version]) {
        for (const field of [
          version.subtotalAmount,
          version.manualAdjustmentAmount,
          version.shippingFeeAmount,
          version.totalAmount,
          version.depositPercent,
          version.depositAmount,
          version.remainingAmount,
        ]) {
          expect(typeof field).toBe('string');
        }
      }
      for (const line of read.lineItems) {
        expect(typeof line.unitPriceAmount).toBe('string');
        expect(typeof line.lineTotalAmount).toBe('string');
      }
    });

    it('preserves the scale the column stores, and the split as it was recorded', async () => {
      const quotationId = await seedQuotation();
      // An odd total whose 40% share is not a whole đồng. VND has no minor unit
      // (DEV-DB6-005), so the drafting rule already resolved it — half up on the
      // deposit, the remainder by subtraction — and the row holds the result.
      const versionId = await addVersion(quotationId, 100_000, {
        subtotalAmount: '1000000.00',
        manualAdjustmentAmount: '-1.00',
        adjustmentReason: 'Làm tròn theo thoả thuận',
        totalAmount: '1049999.00',
        depositAmount: '420000.00',
        remainingAmount: '629999.00',
      });

      const view = await detail.read(quotationId, versionId);

      // Returned exactly as stored: the read does not re-derive the split from
      // `depositPercent`, which for this total would give 419,999.60 — a figure
      // the customer was never shown and the column cannot even hold.
      expect(view.version.depositAmount).toBe('420000.00');
      expect(view.version.remainingAmount).toBe('629999.00');
      expect(view.version.totalAmount).toBe('1049999.00');
      // Both decimal places survive the whole path, string throughout.
      expect(view.version.subtotalAmount).toBe('1000000.00');
      expect(view.version.manualAdjustmentAmount).toBe('-1.00');
    });
  });

  describe('reads have no side effect', () => {
    it('changes no row, no pointer and no state', async () => {
      const quotationId = await seedQuotation();
      const first = await addVersion(quotationId, 100_000);
      await addVersion(quotationId, 200_000);

      const before = await snapshot();

      await history.read(quotationId);
      await detail.read(quotationId, first);
      await history.read(quotationId);

      expect(await snapshot()).toEqual(before);
    });

    it('does not expire a version whose validity has already lapsed', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);
      const lapsed = new Date(Date.now() - HOUR_MS);
      await context.inTransaction(() =>
        quotations.send(versionId, lapsed, new Date(Date.now() - 2 * HOUR_MS)),
      );

      const view = await detail.read(quotationId, versionId);

      // Reported as it stands — SENT with a past `validUntil` — because the
      // expiry sweep is deferred and a GET is not where it would arrive.
      expect(view.version.status).toBe('SENT');
      expect(view.version.expiredAt).toBeUndefined();
      expect(
        (await rows(sql`select status from quotation_versions where id = ${versionId}`))[0],
      ).toEqual({ status: 'SENT' });
    });

    it('appends no request transition and no outbox event', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);

      const counts = async () => ({
        transitions: await count('custom_request_transitions'),
        outbox: await count('outbox_events'),
        versions: await count('quotation_versions'),
        lines: await count('quotation_line_items'),
      });
      const before = await counts();

      await history.read(quotationId);
      await detail.read(quotationId, versionId);

      expect(await counts()).toEqual(before);
    });

    it('leaves the custom request exactly where it was', async () => {
      const quotationId = await seedQuotation();
      const versionId = await addVersion(quotationId, 100_000);
      const before = await rows(
        sql`select status, current_quotation_id, updated_at from custom_requests`,
      );

      await history.read(quotationId);
      await detail.read(quotationId, versionId);

      expect(
        await rows(sql`select status, current_quotation_id, updated_at from custom_requests`),
      ).toEqual(before);
      expect(before[0]?.['current_quotation_id']).toBeNull();
    });
  });

  async function rows(statement: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
    const result = await context.disposable.client.db.execute<Record<string, unknown>>(statement);
    return [...result.rows];
  }

  async function count(table: string): Promise<number> {
    const result = await context.disposable.client.db.execute<{ count: string }>(
      sql`select count(*)::text as count from ${sql.identifier(table)}`,
    );
    return Number(result.rows[0]?.count ?? '-1');
  }

  /** Every quotation row that a read could conceivably touch. */
  async function snapshot(): Promise<Record<string, unknown>[][]> {
    return [
      await rows(sql`select * from quotations order by id`),
      await rows(sql`select * from quotation_versions order by version`),
      await rows(sql`select * from quotation_line_items order by quotation_version_id, position`),
    ];
  }
});
