/**
 * Admin SKU authoring (`APP7-B01`, IMP-D052 / `APP7-G01` §11).
 *
 * The rule that shapes both commands: **`product_variants` is the concurrency
 * arbiter.** `skus.product_variant_id` carries no uniqueness constraint, so
 * nothing in the database stops two concurrent Admin writes from each leaving a
 * sellable SKU on the same variant. Every mutation therefore runs the same
 * sequence in one transaction:
 *
 * ```text
 * begin
 *   lock the owning product_variant FOR UPDATE
 *   prove the product/variant relationship from the locked rows
 *   re-read the variant's whole SKU set inside the transaction
 *   apply the mutation
 *   re-evaluate the resulting order-eligible set
 *   refuse an ambiguous result
 * commit
 * ```
 *
 * There is no application mutex, no in-memory lock and no check-then-write
 * outside one transaction — this API runs in more than one process, and any of
 * those would be a guard that only holds on a single host. Nothing here selects
 * a SKU for an order, and nothing synthesises one: the checkpoint makes the
 * valid state reachable and refuses to create the ambiguous one.
 *
 * No schema change and no migration: `APP7-DB01` is the evidence association,
 * and it is not pulled forward.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId, SQLSTATE } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { productSkuError } from '../domain/product-sku.errors';
import {
  evaluateOrderEligibility,
  isSkuAuthorableProductState,
  SKU_ORDER_ELIGIBLE_IS_ACTIVE,
} from '../domain/product-sku.policy';
import type {
  ProductId,
  ProductVariantId,
  SkuId,
} from '../domain/repositories/placement-hierarchy.port';
import {
  PRODUCT_SKU_REPOSITORY,
  type ProductSkuRepository,
  type SkuWriteContext,
  type UpdateSkuFields,
  type VariantLockResult,
} from '../domain/repositories/product-sku.repository';
import { toAdminSkuView, type AdminSkuView } from './product-sku.projection';

/** Audit actions; lowercase dot-namespaced, as the DB3 vocabulary requires. */
export const SKU_CREATED_ACTION = 'product.sku_created';
export const SKU_UPDATED_ACTION = 'product.sku_updated';

export interface CreateSkuCommand {
  readonly productId: string;
  readonly variantId: string;
  readonly code: string;
  readonly priceOverrideAmount?: string | undefined;
  readonly isActive: boolean;
}

export interface UpdateSkuCommand {
  readonly skuId: string;
  readonly fields: UpdateSkuFields;
}

@Injectable()
export class ProductSkuService {
  constructor(
    @Inject(PRODUCT_SKU_REPOSITORY) private readonly skus: ProductSkuRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly transactions: TransactionManager,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async create(command: CreateSkuCommand): Promise<AdminSkuView> {
    return this.transactions.runInTransaction(async () => {
      const context = this.requireWritableVariant(
        await this.skus.lockVariantForWrite(
          command.productId as ProductId,
          command.variantId as ProductVariantId,
        ),
      );

      // Read under the lock, before the write. It is not the arbiter — the
      // post-mutation re-evaluation below is — but refusing here means an
      // ambiguous request never consumes a globally unique SKU code on its way
      // to being rolled back.
      const id = newId() as SkuId;
      const existing = await this.skus.listByVariant(context.variantId);
      if (command.isActive === SKU_ORDER_ELIGIBLE_IS_ACTIVE) {
        this.refuseIfAmbiguous([...existing, { id, isActive: command.isActive }]);
      }

      const created = await this.write(() =>
        this.skus.insert({
          id,
          productVariantId: context.variantId,
          code: command.code,
          priceOverrideAmount: command.priceOverrideAmount,
          isActive: command.isActive,
        }),
      );

      const eligibleCount = await this.settle(context.variantId);
      await this.record(SKU_CREATED_ACTION, context, createdFieldsOf(command), eligibleCount);
      return toAdminSkuView({ sku: created, productId: context.productId, eligibleCount });
    });
  }

  async update(command: UpdateSkuCommand): Promise<AdminSkuView> {
    const skuId = command.skuId as SkuId;

    return this.transactions.runInTransaction(async () => {
      // The owning variant is resolved server-side from the SKU, never from the
      // request: there is no body field that can name a variant, so no request
      // can rebind a SKU to another one.
      const lock = await this.skus.lockVariantOfSku(skuId);
      if (lock === undefined) {
        throw productSkuError('SKU_NOT_FOUND');
      }
      const context = this.requireWritableVariant(lock);

      const existing = await this.skus.listByVariant(context.variantId);
      const current = existing.find((sku) => sku.id === skuId);
      if (current === undefined) {
        // Re-read under the lock: the row was there when its owner was looked
        // up and is not there now, so the request is answered as a miss rather
        // than written against a row that no longer exists.
        throw productSkuError('SKU_NOT_FOUND');
      }

      if (command.fields.isActive === SKU_ORDER_ELIGIBLE_IS_ACTIVE && !current.isActive) {
        this.refuseIfAmbiguous(
          existing.map((sku) => (sku.id === skuId ? { ...sku, isActive: true } : sku)),
        );
      }

      const updated = await this.write(() => this.skus.update(skuId, command.fields));
      if (updated === undefined) {
        throw productSkuError('SKU_NOT_FOUND');
      }

      const eligibleCount = await this.settle(context.variantId);
      await this.record(
        SKU_UPDATED_ACTION,
        context,
        changedFieldsOf(command.fields),
        eligibleCount,
      );
      return toAdminSkuView({ sku: updated, productId: context.productId, eligibleCount });
    });
  }

  /**
   * The arbiter: re-read the whole set under the lock the mutation was made
   * under, and refuse the transaction if it is ambiguous.
   *
   * Refusing by throwing is what makes the refusal atomic — the rollback takes
   * the insert or update with it, so a refused mutation leaves the variant
   * exactly as it was rather than half-applied.
   */
  private async settle(variantId: ProductVariantId): Promise<number> {
    const after = await this.skus.listByVariant(variantId);
    return this.refuseIfAmbiguous(after);
  }

  private refuseIfAmbiguous(skus: readonly { id: string; isActive: boolean }[]): number {
    const eligibility = evaluateOrderEligibility(skus);
    if (eligibility.ambiguous) {
      throw productSkuError('SKU_ORDER_ELIGIBLE_AMBIGUOUS');
    }
    return eligibility.eligibleCount;
  }

  private requireWritableVariant(lock: VariantLockResult): SkuWriteContext {
    if (!lock.ok) {
      throw productSkuError(
        lock.reason === 'PRODUCT_NOT_FOUND'
          ? 'SKU_PRODUCT_NOT_FOUND'
          : lock.reason === 'VARIANT_NOT_FOUND'
            ? 'SKU_VARIANT_NOT_FOUND'
            : 'SKU_VARIANT_PRODUCT_MISMATCH',
      );
    }
    if (!isSkuAuthorableProductState(lock.context.productStatus)) {
      throw productSkuError('SKU_PRODUCT_NOT_AUTHORABLE');
    }
    return lock.context;
  }

  /**
   * Runs one write with the database's own refusals translated.
   *
   * `CST-012` stays the final arbiter of code identity — the application never
   * pre-checks the code and then races itself — and the driver's message, which
   * names the table and the constraint, is discarded: only the SQLSTATE is read.
   */
  private async write<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.diagnostics.sqlState === SQLSTATE.UNIQUE_VIOLATION) {
        throw productSkuError('SKU_CODE_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * The evidence one SKU mutation leaves, in the same transaction.
   *
   * `DB3_AUDIT_SPECIFICATION.md` files variant/SKU edits under the
   * Product/catalog row: actor `ADMIN`, target the Product, a changed-field
   * summary, and no required reason — the `R` on that row is archive/unarchive
   * only. The summary carries field **names** and a count, never a code, a
   * price, an id or a row: an audit entry is evidence, not a second copy of
   * what it describes.
   */
  private async record(
    action: string,
    context: SkuWriteContext,
    changed: readonly string[],
    eligibleCount: number,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action,
      targetKind: 'PRODUCT',
      targetId: context.productId,
      summary: { changed: [...changed], orderEligibleSkus: eligibleCount },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, from the bound request actor.
   *
   * Never from the body or the row: an unattributable SKU change must fail
   * rather than be filed against a fabricated identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('A SKU mutation requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}

/** The field names a patch actually named — the audit summary's whole content. */
export function changedFieldsOf(fields: UpdateSkuFields): readonly string[] {
  return (['code', 'priceOverrideAmount', 'isActive'] as const).filter(
    (name) => fields[name] !== undefined,
  );
}

/** The same, for a create: the fields the new row actually received a value for. */
export function createdFieldsOf(command: CreateSkuCommand): readonly string[] {
  return [
    'code',
    ...(command.priceOverrideAmount === undefined ? [] : ['priceOverrideAmount']),
    'isActive',
  ];
}
