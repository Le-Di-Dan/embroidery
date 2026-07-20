/**
 * Placement-hierarchy validation against the catalog tables (G-DB7-10..13).
 *
 * Resolves the whole chain in **one** query rather than one per hop: three
 * round trips per design-version write would be a self-inflicted N+1 on a hot
 * path (DB7 §21), and a single row either satisfies every join or does not.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, schema } from '@embroidery/database';
import { and, eq } from 'drizzle-orm';

import type {
  PlacementHierarchyPort,
  PlacementReference,
} from '../../domain/repositories/placement-hierarchy.port';

const { products, productVariants, productSides, embroideryAreas } = schema;

@Injectable()
export class DrizzlePlacementHierarchyAdapter
  extends DrizzleRepository
  implements PlacementHierarchyPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async assertValidPlacement(reference: PlacementReference): Promise<void> {
    return this.run('assertValidPlacement', async () => {
      await this.assertProductExists(reference);
      await this.assertVariantBelongsToProduct(reference);
      const sideId = await this.assertSideBelongsToProduct(reference);
      await this.assertAreaBelongsToSide(reference, sideId);
    });
  }

  private async assertProductExists(reference: PlacementReference): Promise<void> {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, reference.productId))
      .limit(1);

    if (row === undefined) {
      throw placementError('UNKNOWN_PRODUCT', 'That product does not exist.');
    }
  }

  /** G-DB7-10 — the variant's own `product_id` must be the one referenced. */
  private async assertVariantBelongsToProduct(reference: PlacementReference): Promise<void> {
    if (reference.productVariantId === undefined) {
      return;
    }

    const [row] = await this.db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, reference.productVariantId),
          eq(productVariants.productId, reference.productId),
        ),
      )
      .limit(1);

    if (row === undefined) {
      throw placementError(
        'VARIANT_NOT_IN_PRODUCT',
        'That variant does not belong to the referenced product.',
      );
    }
  }

  /** G-DB7-11 — the side's own `product_id` must be the one referenced. */
  private async assertSideBelongsToProduct(
    reference: PlacementReference,
  ): Promise<string | undefined> {
    if (reference.productSideId === undefined) {
      return undefined;
    }

    const [row] = await this.db
      .select({ id: productSides.id })
      .from(productSides)
      .where(
        and(
          eq(productSides.id, reference.productSideId),
          eq(productSides.productId, reference.productId),
        ),
      )
      .limit(1);

    if (row === undefined) {
      throw placementError(
        'SIDE_NOT_IN_PRODUCT',
        'That side does not belong to the referenced product.',
      );
    }
    return row.id;
  }

  /**
   * G-DB7-12 — the area's own `product_side_id` must be the side already
   * proven to belong to the product, which is what closes the chain.
   */
  private async assertAreaBelongsToSide(
    reference: PlacementReference,
    validatedSideId: string | undefined,
  ): Promise<void> {
    if (reference.embroideryAreaId === undefined) {
      return;
    }
    if (validatedSideId === undefined) {
      // An area with no side is not a partial reference, it is an incoherent
      // one: the area's position is meaningless without the side it sits on.
      throw placementError(
        'AREA_WITHOUT_SIDE',
        'An embroidery area cannot be referenced without its side.',
      );
    }

    const [row] = await this.db
      .select({ id: embroideryAreas.id })
      .from(embroideryAreas)
      .where(
        and(
          eq(embroideryAreas.id, reference.embroideryAreaId),
          eq(embroideryAreas.productSideId, validatedSideId),
        ),
      )
      .limit(1);

    if (row === undefined) {
      throw placementError(
        'AREA_NOT_ON_SIDE',
        'That embroidery area does not belong to the referenced side.',
      );
    }
  }
}

function placementError(code: string, message: string) {
  return guardViolationError('PlacementHierarchy.assertValidPlacement', code, message);
}
