/**
 * Drizzle implementation of the AGG-06 Product contract (TBL-012..TBL-017).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { ProductState } from '@embroidery/database';
import { asc, eq, inArray } from 'drizzle-orm';

import type {
  AddAreaInput,
  AddSideInput,
  AddSkuInput,
  AddVariantInput,
  CreateProductInput,
  EmbroideryArea,
  Product,
  ProductRepository,
  ProductSide,
  ProductStructure,
  ProductVariant,
  Sku,
} from '../../domain/repositories/product.repository';
import type { ProductId, SkuId } from '../../domain/repositories/placement-hierarchy.port';
import { toArea, toProduct, toSide, toSku, toVariant } from './product-row.mapper';

const { products, productVariants, skus, productSides, embroideryAreas, productMedia } = schema;

/** VND, the only currency DB6 permits (`ck_products__currency_allowed`). */
const CURRENCY = 'VND';

@Injectable()
export class DrizzleProductRepository extends DrizzleRepository implements ProductRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: CreateProductInput): Promise<Product> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(products)
        .values({
          id: input.id,
          categoryId: input.categoryId,
          name: input.name,
          slug: input.slug,
          basePriceAmount: input.basePriceAmount,
          currencyCode: CURRENCY,
          status: 'DRAFT',
          isDisplayOutOfStock: false,
          displayOrder: input.displayOrder,
          isIndexable: true,
        })
        .returning();

      return toProduct(expect(row, 'create', 'product'));
    });
  }

  async addVariant(input: AddVariantInput): Promise<ProductVariant> {
    return this.run('addVariant', async () => {
      const [row] = await this.db
        .insert(productVariants)
        .values({
          id: input.id,
          productId: input.productId,
          colorName: input.colorName ?? null,
          sizeLabel: input.sizeLabel ?? null,
          displayOrder: input.displayOrder,
          isActive: true,
        })
        .returning();

      return toVariant(expect(row, 'addVariant', 'variant'));
    });
  }

  async addSku(input: AddSkuInput): Promise<Sku> {
    return this.run('addSku', async () => {
      const [row] = await this.db
        .insert(skus)
        .values({
          id: input.id,
          productVariantId: input.productVariantId,
          code: input.code,
          priceOverrideAmount: input.priceOverrideAmount ?? null,
          currencyCode: CURRENCY,
          isActive: true,
        })
        .returning();

      return toSku(expect(row, 'addSku', 'SKU'));
    });
  }

  async addSide(input: AddSideInput): Promise<ProductSide> {
    return this.run('addSide', async () => {
      const [row] = await this.db
        .insert(productSides)
        .values({
          id: input.id,
          productId: input.productId,
          code: input.code,
          name: input.name,
          backgroundAssetId: input.backgroundAssetId,
          imageWidthPx: input.imageWidthPx,
          imageHeightPx: input.imageHeightPx,
          physicalWidthMm: input.physicalWidthMm,
          physicalHeightMm: input.physicalHeightMm,
          pxPerMm: input.pxPerMm,
          displayOrder: input.displayOrder,
        })
        .returning();

      return toSide(expect(row, 'addSide', 'side'));
    });
  }

  async addArea(input: AddAreaInput): Promise<EmbroideryArea> {
    return this.run('addArea', async () => {
      const [row] = await this.db
        .insert(embroideryAreas)
        .values({
          id: input.id,
          productSideId: input.productSideId,
          code: input.code,
          name: input.name,
          boundXPx: input.boundXPx,
          boundYPx: input.boundYPx,
          boundWidthPx: input.boundWidthPx,
          boundHeightPx: input.boundHeightPx,
          displayOrder: input.displayOrder,
        })
        .returning();

      return toArea(expect(row, 'addArea', 'area'));
    });
  }

  async attachMedia(input: { productId: ProductId; assetId: string; role: string }): Promise<void> {
    return this.run('attachMedia', async () => {
      await this.db.insert(productMedia).values({
        id: newId(),
        productId: input.productId,
        assetId: input.assetId,
        role: input.role,
        displayOrder: 0,
      });
    });
  }

  async changeStatus(id: ProductId, status: ProductState): Promise<Product> {
    return this.run('changeStatus', async () => {
      const [row] = await this.db
        .update(products)
        .set({
          status,
          // Archiving stamps the instant; any other transition clears it, so
          // the column cannot claim an archive that was undone.
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError('ProductRepository.changeStatus', 'That product does not exist.');
      }
      return toProduct(row);
    });
  }

  async findById(id: ProductId): Promise<Product | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
      return row === undefined ? undefined : toProduct(row);
    });
  }

  async findBySlug(slug: string): Promise<Product | undefined> {
    return this.run('findBySlug', async () => {
      const [row] = await this.db.select().from(products).where(eq(products.slug, slug)).limit(1);
      return row === undefined ? undefined : toProduct(row);
    });
  }

  async loadStructure(id: ProductId): Promise<ProductStructure | undefined> {
    return this.run('loadStructure', async () => {
      const product = await this.findById(id);
      if (product === undefined) {
        return undefined;
      }

      // One query per child table, never one per parent row: the variants are
      // fetched once and the SKUs once for all of them (DB7 §21, no N+1).
      const variants = await this.db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, id))
        .orderBy(asc(productVariants.displayOrder));

      const variantIds = variants.map((variant) => variant.id);
      const skuRows =
        variantIds.length === 0
          ? []
          : await this.db.select().from(skus).where(inArray(skus.productVariantId, variantIds));

      const sides = await this.db
        .select()
        .from(productSides)
        .where(eq(productSides.productId, id))
        .orderBy(asc(productSides.displayOrder));

      const sideIds = sides.map((side) => side.id);
      const areas =
        sideIds.length === 0
          ? []
          : await this.db
              .select()
              .from(embroideryAreas)
              .where(inArray(embroideryAreas.productSideId, sideIds))
              .orderBy(asc(embroideryAreas.displayOrder));

      return {
        product,
        variants: variants.map(toVariant),
        skus: skuRows.map(toSku),
        sides: sides.map(toSide),
        areas: areas.map(toArea),
      };
    });
  }

  async findSkuByCode(code: string): Promise<Sku | undefined> {
    return this.run('findSkuByCode', async () => {
      const [row] = await this.db.select().from(skus).where(eq(skus.code, code)).limit(1);
      return row === undefined ? undefined : toSku(row);
    });
  }
}

/** An insert that returned nothing means the write silently did not happen. */
function expect<T>(row: T | undefined, operation: string, what: string): T {
  if (row === undefined) {
    throw guardViolationError(
      `ProductRepository.${operation}`,
      'CATALOG_WRITE_FAILED',
      `Could not create the ${what}.`,
    );
  }
  return row;
}

export type { SkuId };
