/**
 * Admin variant authoring (`APP12-N02.B01`, `N02.G01` / `N02.D01` §E).
 *
 * The rule that shapes both commands: **the Product row is the concurrency
 * arbiter.** `product_variants` carries no unique constraint on
 * `(product_id, color_name, size_label)` and `display_order` is `NOT NULL` with
 * no `DEFAULT`, so nothing in the database stops two concurrent Admin writes
 * from each creating the same variant twice or each claiming the same order.
 * Every mutation therefore runs the same sequence in one transaction:
 *
 * ```text
 * begin
 *   lock the owning product FOR UPDATE
 *   prove the product state allows authoring
 *   re-read the product's whole variant set inside the transaction
 *   normalize the labels and settle identity against that set
 *   assign display_order from that set (create only)
 *   mutate
 *   return the settled row
 * commit
 * ```
 *
 * There is no application mutex, no in-memory lock and no check-then-write
 * outside one transaction — this API runs in more than one process, and any of
 * those would be a guard that only holds on a single host.
 *
 * There is no DELETE, here or anywhere in the contract. A variant leaves the
 * catalog by `isActive = false`, which is what keeps the commercial history
 * that references it readable (`N02.D01` §E). Deactivation never unpublishes
 * the Product: a live Product that becomes structurally unsellable is a state
 * the operator repairs in place, not one the system withdraws for them.
 *
 * No schema change and no migration.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { productVariantError } from '../domain/product-variant.errors';
import {
  hasVariantLabel,
  isVariantAuthorableProductState,
  nextVariantDisplayOrder,
  normalizeVariantLabel,
  variantIdentityKey,
  type VariantIdentity,
} from '../domain/product-variant.policy';
import type { ProductId, ProductVariantId } from '../domain/repositories/placement-hierarchy.port';
import {
  PRODUCT_VARIANT_REPOSITORY,
  type ProductVariantRecord,
  type ProductVariantRepository,
  type UpdateProductVariantFields,
  type VariantWriteContext,
} from '../domain/repositories/product-variant.repository';
import {
  toAdminProductVariantListView,
  toAdminProductVariantView,
  type AdminProductVariantListView,
  type AdminProductVariantView,
} from './product-variant.projection';

/** Audit actions; lowercase dot-namespaced, as the DB3 vocabulary requires. */
export const VARIANT_CREATED_ACTION = 'product.variant_created';
export const VARIANT_UPDATED_ACTION = 'product.variant_updated';

export interface CreateProductVariantCommand {
  readonly productId: string;
  readonly colorName: string | null | undefined;
  readonly sizeLabel: string | null | undefined;
  readonly isActive: boolean;
}

/** The patch, exactly as the request named it. An absent key is not a change. */
export interface UpdateProductVariantCommand {
  readonly productId: string;
  readonly variantId: string;
  readonly fields: {
    readonly colorName?: string | null;
    readonly sizeLabel?: string | null;
    readonly isActive?: boolean;
  };
}

@Injectable()
export class ProductVariantService {
  constructor(
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly transactions: TransactionManager,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /**
   * The authoring read.
   *
   * Side-effect-free by construction: no transaction, no lock, no audit row.
   * Every lifecycle state is readable, `ARCHIVED` included — refusing to show
   * an archived Product's variants would hide the history the operator is
   * looking at them for, and reading is not authoring.
   */
  async list(productId: string): Promise<AdminProductVariantListView> {
    const id = productId as ProductId;
    const status = await this.variants.findProductStatus(id);
    if (status === undefined) {
      throw productVariantError('VARIANT_PRODUCT_NOT_FOUND');
    }

    // Two batched reads, never one per variant.
    const [variants, skus] = await Promise.all([
      this.variants.listByProduct(id),
      this.variants.listSkusByProduct(id),
    ]);

    return toAdminProductVariantListView({ productId, variants, skus });
  }

  async create(command: CreateProductVariantCommand): Promise<AdminProductVariantView> {
    return this.transactions.runInTransaction(async () => {
      const context = await this.requireWritableProduct(command.productId as ProductId);
      const identity = this.requireIdentity({
        colorName: normalizeVariantLabel(command.colorName),
        sizeLabel: normalizeVariantLabel(command.sizeLabel),
      });

      // Read under the lock, after it: both the duplicate decision and the
      // assigned order are properties of this set, and a set read before the
      // lock could be missing a concurrent sibling.
      const existing = await this.variants.listByProductForUpdate(context.productId);
      this.refuseDuplicate(existing, identity, undefined);

      const created = await this.variants.insert({
        id: newId() as ProductVariantId,
        productId: context.productId,
        colorName: identity.colorName,
        sizeLabel: identity.sizeLabel,
        displayOrder: nextVariantDisplayOrder(existing),
        isActive: command.isActive,
      });

      await this.record(
        VARIANT_CREATED_ACTION,
        context,
        createdFieldsOf(command),
        existing.filter((variant) => variant.isActive).length + (created.isActive ? 1 : 0),
      );
      return toAdminProductVariantView(created);
    });
  }

  async update(command: UpdateProductVariantCommand): Promise<AdminProductVariantView> {
    const variantId = command.variantId as ProductVariantId;

    return this.transactions.runInTransaction(async () => {
      const context = await this.requireWritableProduct(command.productId as ProductId);

      const existing = await this.variants.listByProductForUpdate(context.productId);
      const current = existing.find((variant) => variant.id === variantId);
      if (current === undefined) {
        throw productVariantError(await this.explainMissingVariant(variantId));
      }

      // The identity the row would have *after* the patch: a field the request
      // did not name keeps the stored value, so renaming only the size still
      // has to be checked against the colour already on the row.
      const identity = this.requireIdentity({
        colorName: this.patchedLabel(command.fields, 'colorName', current.colorName),
        sizeLabel: this.patchedLabel(command.fields, 'sizeLabel', current.sizeLabel),
      });
      this.refuseDuplicate(existing, identity, variantId);

      const updated = await this.variants.update(
        variantId,
        this.writableFields(command.fields, identity),
      );
      if (updated === undefined) {
        // Unreachable while the Product lock is held — the row was in the set
        // read under it — and answered as a miss rather than as a crash.
        throw productVariantError('VARIANT_NOT_FOUND');
      }

      await this.record(
        VARIANT_UPDATED_ACTION,
        context,
        changedFieldsOf(command.fields),
        countActive(existing, updated),
      );
      return toAdminProductVariantView(updated);
    });
  }

  /** The locked Product, proved to be in a state that admits authoring. */
  private async requireWritableProduct(productId: ProductId): Promise<VariantWriteContext> {
    const context = await this.variants.lockProductForWrite(productId);
    if (context === undefined) {
      throw productVariantError('VARIANT_PRODUCT_NOT_FOUND');
    }
    if (!isVariantAuthorableProductState(context.productStatus)) {
      throw productVariantError('VARIANT_PRODUCT_NOT_AUTHORABLE');
    }
    return context;
  }

  private requireIdentity(identity: VariantIdentity): VariantIdentity {
    if (!hasVariantLabel(identity)) {
      throw productVariantError('VARIANT_LABEL_REQUIRED');
    }
    return identity;
  }

  /**
   * The duplicate rule, settled against the set read under the same lock the
   * mutation is made under.
   *
   * Refusing by throwing is what makes the refusal atomic: the rollback takes
   * any write with it, so a refused mutation leaves the Product exactly as it
   * was. `self` is excluded so re-saving a variant without changing its labels
   * is not a collision with itself.
   */
  private refuseDuplicate(
    existing: readonly ProductVariantRecord[],
    identity: VariantIdentity,
    self: ProductVariantId | undefined,
  ): void {
    const key = variantIdentityKey(identity);
    const collides = existing.some(
      (variant) => variant.id !== self && variantIdentityKey(variant) === key,
    );
    if (collides) {
      throw productVariantError('PRODUCT_VARIANT_DUPLICATE');
    }
  }

  /** A named label, normalized; an unnamed one, as stored. */
  private patchedLabel(
    fields: UpdateProductVariantCommand['fields'],
    name: 'colorName' | 'sizeLabel',
    current: string | undefined,
  ): string | undefined {
    return name in fields ? normalizeVariantLabel(fields[name]) : current;
  }

  /**
   * What actually reaches the UPDATE.
   *
   * A named label is written in its **normalized** form rather than as it
   * arrived, so `"  Xanh   navy "` is stored as the same bytes the duplicate
   * rule compared. `null` clears the column; an unnamed field is absent, so it
   * is not written at all.
   */
  private writableFields(
    fields: UpdateProductVariantCommand['fields'],
    identity: VariantIdentity,
  ): UpdateProductVariantFields {
    return {
      ...('colorName' in fields ? { colorName: identity.colorName ?? null } : {}),
      ...('sizeLabel' in fields ? { sizeLabel: identity.sizeLabel ?? null } : {}),
      ...(fields.isActive === undefined ? {} : { isActive: fields.isActive }),
    };
  }

  /**
   * Why the locked set did not contain the addressed variant.
   *
   * An operator who addressed the right variant under the wrong Product needs a
   * different answer from one who addressed a variant that does not exist, and
   * reporting both as "no such variant" would send the first looking for a row
   * that is there.
   */
  private async explainMissingVariant(
    variantId: ProductVariantId,
  ): Promise<'VARIANT_NOT_FOUND' | 'VARIANT_PRODUCT_MISMATCH'> {
    const owner = await this.variants.findOwningProduct(variantId);
    return owner === undefined ? 'VARIANT_NOT_FOUND' : 'VARIANT_PRODUCT_MISMATCH';
  }

  /**
   * The evidence one variant mutation leaves, in the same transaction.
   *
   * `DB3_AUDIT_SPECIFICATION.md` files variant edits under the Product row:
   * actor `ADMIN`, target the Product, a changed-field summary, and no required
   * reason. The summary carries field **names** and a count, never a label, an
   * id or a row: an audit entry is evidence, not a second copy of what it
   * describes — and a colour an operator typed is exactly the kind of free text
   * that must not be copied into a durable log by an unrelated mechanism.
   */
  private async record(
    action: string,
    context: VariantWriteContext,
    changed: readonly string[],
    activeVariants: number,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action,
      targetKind: 'PRODUCT',
      targetId: context.productId,
      summary: { changed: [...changed], activeVariants },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, from the bound request actor.
   *
   * Never from the body or the row: an unattributable variant change must fail
   * rather than be filed against a fabricated identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('A variant mutation requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}

/** How many variants of the Product are active once this patch is applied. */
function countActive(
  existing: readonly ProductVariantRecord[],
  updated: ProductVariantRecord,
): number {
  return existing.filter((variant) =>
    variant.id === updated.id ? updated.isActive : variant.isActive,
  ).length;
}

/** The field names a patch actually named — the audit summary's whole content. */
export function changedFieldsOf(fields: UpdateProductVariantCommand['fields']): readonly string[] {
  return (['colorName', 'sizeLabel', 'isActive'] as const).filter((name) => name in fields);
}

/** The same, for a create: the fields the new row actually received a value for. */
export function createdFieldsOf(command: CreateProductVariantCommand): readonly string[] {
  return [
    ...(normalizeVariantLabel(command.colorName) === undefined ? [] : ['colorName']),
    ...(normalizeVariantLabel(command.sizeLabel) === undefined ? [] : ['sizeLabel']),
    'displayOrder',
    'isActive',
  ];
}
