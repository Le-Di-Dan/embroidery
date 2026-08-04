/**
 * `APP3-B01N` — the normalization request producer against a real database.
 *
 * Only a live transaction can prove the property the checkpoint is about: the
 * Side and the event that asks for its background to be normalized commit
 * together, or neither exists. Everything else — that a rename schedules
 * nothing, that a lost compare-and-set leaves no request behind — is a claim
 * about rows, so it is asserted against `outbox_events` directly rather than
 * through anything the API would also be reporting.
 *
 * The payload is compared to the shared builder's output rather than to a
 * literal. That is deliberate: the worker's own suite proves the builder's
 * output parses, so equality here closes the chain from a committed row to an
 * accepted job without either application importing the other.
 */
import { sql } from 'drizzle-orm';
import {
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';
import { TransactionManager } from '@embroidery/persistence';

import { ProductPlacementNormalizationRecorder } from '../../src/modules/catalog/application/product-placement-normalization.recorder';
import { ProductPlacementQuery } from '../../src/modules/catalog/application/product-placement.query';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  asAdmin,
  rows,
  idList,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import {
  areaCommand,
  seedBackgroundAsset,
  seedTemplateReferencing,
  sideCommand,
} from '../support/product-placement-fixtures';

interface EventRow extends Record<string, unknown> {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_kind: string;
  readonly aggregate_id: string;
  readonly payload: Record<string, unknown>;
  readonly payload_schema_version: number;
  readonly status: string;
}

interface SideRow extends Record<string, unknown> {
  readonly id: string;
  readonly code: string;
  readonly background_asset_id: string;
  readonly retired_at: Date | null;
}

describe('placement normalization requests (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let placement: ProductPlacementService;
  let query: ProductPlacementQuery;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app3b01n-normalization');
    placement = ctx.app.get(ProductPlacementService);
    query = ctx.app.get(ProductPlacementQuery);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  /** Every normalization request naming one of these Assets, oldest first. */
  const requestsFor = (assetIds: readonly string[]) =>
    rows<EventRow>(
      ctx,
      sql`select * from outbox_events
          where event_type = ${ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE}
            and aggregate_id in ${idList(assetIds)}
          order by id`,
    );

  const sideRows = (productId: string) =>
    rows<SideRow>(
      ctx,
      sql`select * from product_sides where product_id = ${productId} order by code`,
    );

  /**
   * The live Area of a Side.
   *
   * Retained by id in every follow-up save that is not about Areas: omitting it
   * would retire the row and insert a second one with the same code, which the
   * partial unique index refuses — a `APP3-B01` rule, not a normalization one.
   */
  const areaIdOf = async (sideId: string): Promise<string> =>
    (
      await rows<{ id: string }>(
        ctx,
        sql`select id from embroidery_areas
            where product_side_id = ${sideId} and retired_at is null`,
      )
    )[0]?.id ?? '';

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  async function seedProduct(): Promise<{
    productId: string;
    updatedAt: string;
    backgroundAssetId: string;
  }> {
    const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
    const backgroundAssetId = await seedBackgroundAsset(ctx);
    return { ...product, backgroundAssetId };
  }

  const replace = async (
    productId: string,
    updatedAt: string,
    sides: readonly ReturnType<typeof sideCommand>[],
  ) =>
    asAdmin(ctx, adminId, () =>
      placement.replace({ productId, expectedUpdatedAt: new Date(updatedAt), sides }),
    );

  describe('a background association is created', () => {
    it('commits the side and exactly one request together', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      const events = await requestsFor([backgroundAssetId]);
      const sides = await sideRows(productId);
      expect(events).toHaveLength(1);
      expect(sides).toHaveLength(1);
      expect(events[0]?.aggregate_kind).toBe('ASSET');
      expect(events[0]?.aggregate_id).toBe(backgroundAssetId);
      expect(events[0]?.status).toBe('PENDING');
      expect(events[0]?.payload_schema_version).toBe(ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION);
    });

    it('names the committed generated side id, not one invented before the write', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      const [side] = await sideRows(productId);
      const [event] = await requestsFor([backgroundAssetId]);
      const reference = event?.payload['associationRef'] as { productSideId?: string } | undefined;
      expect(reference?.productSideId).toBe(side?.id);
      // And the row it names really is the one carrying that background.
      expect(side?.background_asset_id).toBe(backgroundAssetId);
    });

    it('commits the exact v1 payload the shared builder produces', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      const [side] = await sideRows(productId);
      const [event] = await requestsFor([backgroundAssetId]);
      expect(event?.payload).toEqual(
        buildAssetNormalizationRequestedPayload({
          assetId: backgroundAssetId,
          associationRef: {
            kind: 'PRODUCT_SIDE_BACKGROUND',
            productSideId: side?.id ?? '',
          },
        }),
      );
    });

    it('appends one request per side when two are created', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const second = await seedBackgroundAsset(ctx);
      await replace(productId, updatedAt, [
        sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] }),
        sideCommand({ code: 'back', displayOrder: 1, backgroundAssetId: second }),
      ]);

      const events = await requestsFor([backgroundAssetId, second]);
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.aggregate_id).sort()).toEqual(
        [backgroundAssetId, second].sort(),
      );
    });

    it('appends one request per side when two sides share one Asset', async () => {
      // Two associations, two events; the consumer converges them onto one
      // derivative (`APP3-W01A`), which is not the producer's call to make.
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] }),
        sideCommand({ code: 'back', displayOrder: 1, backgroundAssetId }),
      ]);

      const events = await requestsFor([backgroundAssetId]);
      const sides = await sideRows(productId);
      expect(events).toHaveLength(2);
      expect(
        events
          .map(
            (event) => (event.payload['associationRef'] as { productSideId: string }).productSideId,
          )
          .sort(),
      ).toEqual(sides.map((side) => side.id).sort());
    });
  });

  describe('a background association changes', () => {
    it('requests the new Asset and never the one it left', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const next = await seedBackgroundAsset(ctx);
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';

      await replace(productId, first.updatedAt, [
        sideCommand({
          id: sideId,
          backgroundAssetId: next,
          areas: [areaCommand({ id: await areaIdOf(sideId) })],
        }),
      ]);

      expect(await requestsFor([next])).toHaveLength(1);
      // The old Asset keeps its single original request and nothing more: no
      // second event, and above all no deletion of what it already produced.
      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('leaves the replaced Asset’s derivative untouched', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const next = await seedBackgroundAsset(ctx);
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';
      await replace(productId, first.updatedAt, [
        sideCommand({
          id: sideId,
          backgroundAssetId: next,
          areas: [areaCommand({ id: await areaIdOf(sideId) })],
        }),
      ]);

      const derivatives = await rows<{ status: string }>(
        ctx,
        sql`select status from asset_derivatives where asset_id = ${backgroundAssetId}`,
      );
      expect(derivatives.map((row) => row.status)).toEqual(['READY']);
    });
  });

  describe('nothing changed for normalization', () => {
    it('appends nothing when the same placement is saved again', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';
      const areaId =
        (
          await rows<{ id: string }>(
            ctx,
            sql`select id from embroidery_areas where product_side_id = ${sideId}`,
          )
        )[0]?.id ?? '';

      await replace(productId, first.updatedAt, [
        sideCommand({ id: sideId, backgroundAssetId, areas: [areaCommand({ id: areaId })] }),
      ]);

      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing for a display-name and order change', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';

      await replace(productId, first.updatedAt, [
        sideCommand({
          id: sideId,
          backgroundAssetId,
          name: 'Mặt sau',
          displayOrder: 3,
          areas: [areaCommand({ id: await areaIdOf(sideId) })],
        }),
      ]);

      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing for an Area-only change', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';

      await replace(productId, first.updatedAt, [
        sideCommand({
          id: sideId,
          backgroundAssetId,
          areas: [areaCommand({ code: 'sleeve', boundXPx: 50, boundYPx: 50 })],
        }),
      ]);

      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing when a side is retired by omission', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      await replace(productId, first.updatedAt, []);

      const sides = await sideRows(productId);
      expect(sides[0]?.retired_at).not.toBeNull();
      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing when an already-retired side is omitted again', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const second = await replace(productId, first.updatedAt, []);
      await replace(productId, second.updatedAt, []);

      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing for a read', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      await query.adminRead(productId);
      await query.adminRead(productId);

      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });
  });

  describe('the transaction does not commit', () => {
    it('appends nothing when the compare-and-set is stale', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      const stale = await codeOf(() =>
        replace(productId, updatedAt, [
          sideCommand({ code: 'back', backgroundAssetId, areas: [areaCommand()] }),
        ]),
      );

      expect(stale).toBe('PLACEMENT_VERSION_CONFLICT');
      expect(await requestsFor([backgroundAssetId])).toHaveLength(1);
    });

    it('appends nothing when validation refuses the request', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const refused = await codeOf(() =>
        replace(productId, updatedAt, [
          // An area larger than the canvas it sits on.
          sideCommand({
            backgroundAssetId,
            areas: [areaCommand({ boundWidthPx: 5000, boundHeightPx: 5000 })],
          }),
        ]),
      );

      expect(refused).not.toBe('NO_ERROR');
      expect(await requestsFor([backgroundAssetId])).toHaveLength(0);
      expect(await sideRows(productId)).toHaveLength(0);
    });

    it('appends nothing when a database guard rolls the transaction back', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const next = await seedBackgroundAsset(ctx);
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = (await sideRows(productId))[0]?.id ?? '';
      const areaId =
        (
          await rows<{ id: string }>(
            ctx,
            sql`select id from embroidery_areas where product_side_id = ${sideId}`,
          )
        )[0]?.id ?? '';
      await seedTemplateReferencing(ctx, productId, sideId, areaId);

      // A referenced side's geometry is immutable (`APP3-DB01`), so this whole
      // transaction is refused — including the background change it also asked
      // for, which would otherwise have appended a request.
      const refused = await codeOf(() =>
        replace(productId, first.updatedAt, [
          sideCommand({
            id: sideId,
            backgroundAssetId: next,
            pxPerMm: 4,
            physicalWidthMm: 250,
            physicalHeightMm: 250,
            areas: [areaCommand({ id: areaId })],
          }),
        ]),
      );

      expect(refused).not.toBe('NO_ERROR');
      expect(await requestsFor([next])).toHaveLength(0);
    });

    it('exposes no request when the transaction fails after the append', async () => {
      // The seam the service itself has no way to reach: the recorder runs, and
      // then the enclosing transaction throws. The row must not survive.
      const assetId = await seedBackgroundAsset(ctx);
      const recorder = ctx.app.get(ProductPlacementNormalizationRecorder);
      const transactions = ctx.app.get(TransactionManager);

      await expect(
        transactions.runInTransaction(async () => {
          await recorder.record([
            { productSideId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099', assetId },
          ]);
          throw new Error('after the append');
        }),
      ).rejects.toThrow('after the append');

      expect(await requestsFor([assetId])).toHaveLength(0);
    });
  });

  describe('two writers, one token', () => {
    it('commits only the winner’s requests', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const other = await seedBackgroundAsset(ctx);

      const settled = await Promise.allSettled([
        replace(productId, updatedAt, [
          sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] }),
        ]),
        replace(productId, updatedAt, [
          sideCommand({ code: 'back', backgroundAssetId: other, areas: [areaCommand()] }),
        ]),
      ]);

      expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const events = await requestsFor([backgroundAssetId, other]);
      expect(events).toHaveLength(1);

      const [side] = await sideRows(productId);
      expect(events[0]?.aggregate_id).toBe(side?.background_asset_id);
    });
  });
});
