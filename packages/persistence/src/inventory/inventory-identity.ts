/**
 * The Catalog identity the AGG-07 SKU Stock contract names (`APP8-B02`).
 *
 * `SkuId` was declared on the Catalog placement-hierarchy port in `apps/api`,
 * which is still its conceptual owner — a SKU is a Catalog row, not an
 * inventory one. It moves here for the same single reason `CustomRequestId`
 * moved in `APP7-W01-C1`: `SkuStockRepository` names it, and after this
 * checkpoint that contract is shared by two applications, so a type it
 * references may not live inside one of them.
 *
 * `placement-hierarchy.port.ts` re-exports it, so the API's Catalog contract
 * still publishes it under its delivered name and every existing import is
 * unchanged. There is exactly one declaration.
 *
 * Nothing else about the Catalog aggregate moved, and nothing else may: AGG-03
 * is written by the API alone.
 */

/** COL-TBL017-01. Branded so a bare string cannot be passed as a SKU id. */
export type SkuId = string & { readonly __brand: 'SkuId' };
