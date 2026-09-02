/**
 * `APP12-B02` — the purchasable-SKU port, on its own.
 *
 * A separate module from `CatalogPublicModule` on the pattern that module set
 * for itself. `CatalogPublicModule` composes controllers, queries and three
 * repositories, and imports the inventory availability snapshot; a consumer
 * that needs one Catalog **fact** inside its own transaction should not have to
 * boot a controller surface to get it, and Ordering must not receive a
 * `PublicProductVariantQuery` it has no business calling.
 *
 * It binds one port to one adapter, exports the Symbol, and imports nothing but
 * `DatabaseModule`. Ordering depends on the interface; Catalog owns the tables.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PURCHASABLE_SKU_PORT } from './domain/repositories/purchasable-sku.port';
import { DrizzlePurchasableSkuAdapter } from './infrastructure/persistence/drizzle-purchasable-sku.adapter';

@Module({
  imports: [DatabaseModule],
  providers: [{ provide: PURCHASABLE_SKU_PORT, useClass: DrizzlePurchasableSkuAdapter }],
  exports: [PURCHASABLE_SKU_PORT],
})
export class CatalogPurchasableSkuModule {}
