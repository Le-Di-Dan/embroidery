/**
 * Replacing a Product's placement model (`APP3-B01`; IMP-D041 PO-01/PO-07).
 *
 * One transaction, opened by a guarded touch of the Product row. That single
 * statement is the whole concurrency story: it proves the caller's
 * `expectedUpdatedAt` is still current, takes the row lock that serialises a
 * second replace of the same Product, and advances the token so a stale write
 * arriving later is refused rather than silently applied on top.
 *
 * Everything is validated before a single row is written, so one bad side
 * leaves the previous placement exactly as it was. And nothing is repaired: a
 * database guard that refuses an edit is translated into a stable error, never
 * caught and retried by deleting and re-inserting the row it protected — that
 * would defeat the guard by doing precisely what it exists to prevent.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { productPlacementError } from '../domain/product-placement.errors';
import {
  REJECTED_SIDE_BACKGROUND_MEDIA_TYPE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
  SIDE_BACKGROUND_SOURCE_MEDIA_TYPES,
} from '../domain/product-placement.policy';
import type { ProductId } from '../domain/repositories/placement-hierarchy.port';
import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../domain/repositories/product-placement.repository';
import { planPlacementReplace, type SideCommand } from './product-placement.plan';
import { toAdminPlacementView, type AdminPlacementView } from './product-placement.projection';

export interface ReplacePlacementCommand {
  readonly productId: string;
  readonly expectedUpdatedAt: Date;
  readonly sides: readonly SideCommand[];
}

/** The audit action; lowercase dot-namespaced, as the vocabulary requires. */
export const PLACEMENT_REPLACED_ACTION = 'product.placement_replaced';

const BACKGROUND_SCOPE = {
  kind: SIDE_BACKGROUND_ASSET_KIND,
  classification: SIDE_BACKGROUND_ASSET_CLASSIFICATION,
} as const;

@Injectable()
export class ProductPlacementService {
  constructor(
    @Inject(PRODUCT_PLACEMENT_REPOSITORY) private readonly placement: ProductPlacementRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly transactions: TransactionManager,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async replace(command: ReplacePlacementCommand): Promise<AdminPlacementView> {
    const productId = command.productId as ProductId;

    return this.transactions.runInTransaction(async () => {
      const lock = await this.placement.lockProductForReplace(productId, command.expectedUpdatedAt);
      if (!lock.ok) {
        throw productPlacementError(
          lock.reason === 'NOT_FOUND'
            ? 'PLACEMENT_PRODUCT_NOT_FOUND'
            : 'PLACEMENT_VERSION_CONFLICT',
        );
      }

      await this.assertBackgroundsUsable(command.sides);
      const current = await this.placement.loadPlacement(productId);

      const plan = planPlacementReplace({
        productId,
        commands: command.sides,
        currentSides: current.sides,
        currentAreas: current.areas,
        nextId: newId,
      });

      await this.apply(plan);
      await this.recordAudit(lock.product.id, plan);

      const snapshot = await this.placement.findPlacement(productId);
      if (snapshot === undefined) {
        // Unreachable: the row was locked in this transaction.
        throw productPlacementError('PLACEMENT_PRODUCT_NOT_FOUND');
      }
      return toAdminPlacementView(snapshot);
    });
  }

  /**
   * Writes the plan in the one order the constraints allow.
   *
   * New rows first, because a retirement may name one of them as its
   * replacement and `fk_*__superseded_by_id` requires the target to exist.
   * Retirements last, so a code freed by a retirement is not needed by an insert
   * in the same statement batch — a replacement row carries a *new* code, and
   * reusing a retired one would be a second row claiming one identity.
   */
  private async apply(plan: ReturnType<typeof planPlacementReplace>): Promise<void> {
    try {
      for (const side of plan.sides.created) await this.placement.createSide(side);
      for (const side of plan.sides.updated) {
        await this.placement.updateSide(side.id, side.fields);
      }
      for (const area of plan.areas.created) await this.placement.createArea(area);
      for (const area of plan.areas.updated) {
        await this.placement.updateArea(area.id, area.fields);
      }

      const at = this.clock.now();
      for (const area of plan.areas.retired) {
        await this.placement.retireArea(area.id, at, area.supersededById);
      }
      for (const side of plan.sides.retired) {
        await this.placement.retireSide(side.id, at, side.supersededById);
      }
    } catch (error: unknown) {
      throw translatePersistenceFailure(error);
    }
  }

  /**
   * Every distinct background must exist, sit in the side-background lane and
   * be a raster source (IMP-D044 PO-03).
   *
   * One locking read for the whole set: the share lock means an asset cannot
   * leave `ACCEPTED` between this check and the commit, which a plain read at
   * `READ COMMITTED` could not promise. SVG is refused here and only here —
   * accepted for Admin Template assets after mandatory sanitization APP3 has
   * not built, and nothing downstream sanitizes a background.
   */
  private async assertBackgroundsUsable(sides: readonly SideCommand[]): Promise<void> {
    const ids: readonly AssetId[] = [
      ...new Set(sides.map((side) => side.backgroundAssetId as AssetId)),
    ];
    if (ids.length === 0) return;

    const found = await this.assets.lockScopedByIds(ids, BACKGROUND_SCOPE);
    const byId = new Map(found.map((asset) => [asset.id as string, asset]));

    for (const id of ids) {
      const asset = byId.get(id);
      if (asset === undefined) {
        // Absent from the scoped read: no such asset, or one outside the lane.
        // Reported identically so this endpoint cannot confirm that a
        // customer's private artwork exists.
        throw productPlacementError('PLACEMENT_BACKGROUND_NOT_FOUND');
      }
      if (asset.status !== SIDE_BACKGROUND_ASSET_STATUS) {
        throw productPlacementError('PLACEMENT_BACKGROUND_NOT_ELIGIBLE', ['NOT_ACCEPTED']);
      }
      if (asset.mimeType === REJECTED_SIDE_BACKGROUND_MEDIA_TYPE) {
        throw productPlacementError('PLACEMENT_BACKGROUND_NOT_ELIGIBLE', ['SVG_NOT_ALLOWED']);
      }
      if (!(SIDE_BACKGROUND_SOURCE_MEDIA_TYPES as readonly string[]).includes(asset.mimeType)) {
        throw productPlacementError('PLACEMENT_BACKGROUND_NOT_ELIGIBLE', [
          'MEDIA_TYPE_NOT_ALLOWED',
        ]);
      }
    }
  }

  /**
   * Bounded counts, never the placement itself.
   *
   * The summary answers "what changed" without carrying a code, a name, an id,
   * a background asset or any geometry — an audit row is evidence, not a second
   * copy of the record it describes.
   *
   * No outbox event: `APP3-B01` owns no consumer and no event type has been
   * locked for placement, and announcing one that nothing is defined to handle
   * would be a contract invented here.
   */
  private async recordAudit(
    productId: string,
    plan: ReturnType<typeof planPlacementReplace>,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: PLACEMENT_REPLACED_ACTION,
      targetKind: 'PRODUCT',
      targetId: productId,
      summary: {
        sidesCreated: plan.sides.created.length,
        sidesUpdated: plan.sides.updated.length,
        sidesRetired: plan.sides.retired.length,
        areasCreated: plan.areas.created.length,
        areasUpdated: plan.areas.updated.length,
        areasRetired: plan.areas.retired.length,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, from the bound request actor.
   *
   * Never from the body or the row: an unattributable placement change must fail
   * rather than be filed against a fabricated identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('A placement replace requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}

/**
 * Turns a database refusal into this feature's stable error.
 *
 * The driver's own message names the table and the offending columns, and the
 * `tg_*__protected_guard` message additionally quotes them — none of it may
 * reach a browser, so the SQLSTATE is read and the text is discarded.
 *
 * `23000` is the placement guard family's contract (migration `0034`, the same
 * code the S24 triggers use). Reaching it means a referenced row's identity or
 * geometry was asked to change; the request is well formed and would have been
 * accepted before the first reference existed, which is why it is a conflict.
 */
export function translatePersistenceFailure(error: unknown): unknown {
  if (!isPersistenceError(error)) return error;
  switch (error.diagnostics.sqlState) {
    case '23000':
      return productPlacementError('PLACEMENT_REFERENCED_IMMUTABLE');
    case '23505':
      return productPlacementError('PLACEMENT_CODE_DUPLICATE');
    case '23514':
      return productPlacementError('PLACEMENT_GEOMETRY_INVALID');
    case '23503':
      return productPlacementError('PLACEMENT_BACKGROUND_NOT_FOUND');
    default:
      return error;
  }
}
