/**
 * The Admin projections of one SKU's stock and of its ledger page
 * (`APP8-B01` §6).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an authenticated operator is allowed to see.
 * The runtime views live beside the queries that build them.
 *
 * ### What is absent, and why each one is absent
 *
 * **Anything customer-owned.** No order, no customer, no custom request, no
 * reservation holder and no hold subject. A reservation reduces `available` and
 * appears in `reservedQuantity` as a number; *whose* it is has no place on an
 * inventory screen, and `SkuStock`, `StockAvailability` and `LedgerEntry` carry
 * none of it, so there is nothing here to omit by discipline alone.
 *
 * **A stored availability.** `available` is computed under the anchor lock and
 * published as the result of that computation. There is no `available` column
 * (`sku_stocks` docblock), and publishing one would invite a client to cache a
 * figure that is only true inside the transaction that produced it.
 *
 * **Money.** No price, no price override, no currency. Stock is a count; the
 * SKU's price is Catalog's and reaches no inventory response.
 *
 * **The actor behind a ledger entry.** `LedgerEntry` is the delivered
 * projection and carries none. The operator behind an adjustment is on its
 * `audit_events` row, which is where `DB3_AUDIT_SPECIFICATION.md` puts it.
 *
 * ### Every quantity is a JSON number, deliberately
 *
 * Unlike money — which travels as a string because `numeric(14,2)` through an
 * IEEE-754 double is lossy — a stock quantity is an `integer` column, whole and
 * far inside the exactly-representable range, so a number is the honest type.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

export class AdminSkuStockResponse {
  @ApiProperty({ format: 'uuid', description: 'The Catalog SKU this stock record belongs to.' })
  skuId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The `sku_stocks` row — the inventory lock anchor. Created on first use if this SKU has ' +
      'never been counted.',
  })
  skuStockId!: string;

  @ApiProperty({
    example: 40,
    description: 'The authoritative operational counter. Never negative (CST-061).',
  })
  quantityOnHand!: number;

  @ApiProperty({
    example: 5,
    description: 'The sum of active soft holds. Holds reduce availability, never on-hand.',
  })
  heldQuantity!: number;

  @ApiProperty({ example: 10, description: 'The sum of active official reservations.' })
  reservedQuantity!: number;

  @ApiProperty({
    example: 25,
    description:
      '`quantityOnHand − heldQuantity − reservedQuantity`, computed under the anchor row lock ' +
      'and never stored. It can be acted on only for as long as that lock was held.',
  })
  available!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'The configured low-stock threshold. Absent when none is configured.',
  })
  lowStockThreshold?: number;

  @ApiProperty({
    description:
      'Q-20’s predicate: a threshold is configured and `quantityOnHand` is at or below it. ' +
      'On-hand, not availability — holds and reservations do not move this flag. Always false ' +
      'when no threshold is configured.',
  })
  lowStock!: boolean;
}

export class AdminSkuStockLedgerEntryResponse {
  @ApiProperty({
    enum: schema.INVENTORY_ENTRY_KINDS,
    example: 'ADJUSTMENT',
    description: 'The movement kind. Direction lives here; `quantity` is the magnitude.',
  })
  entryKind!: string;

  @ApiProperty({ example: 20, description: 'The magnitude, always positive (CST-062).' })
  quantity!: number;

  @ApiProperty({
    example: 20,
    description:
      'The signed effect on `quantityOnHand` — `0` for a pure hold or reservation move, whose ' +
      'goods are still on the shelf. Σ of this column rebuilds the counter.',
  })
  onHandDelta!: number;

  @ApiPropertyOptional({
    example: 'Kiểm kho tháng 8',
    description: 'Mandatory on an ADJUSTMENT (GRD-023); absent on movements that carry none.',
  })
  reason?: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class AdminSkuStockLedgerResponse {
  @ApiProperty({ format: 'uuid' })
  skuId!: string;

  @ApiProperty({ format: 'uuid' })
  skuStockId!: string;

  @ApiProperty({
    type: [AdminSkuStockLedgerEntryResponse],
    description:
      'Newest first, at most 100. An empty array is an ordinary answer: a SKU that has never ' +
      'been counted has no history.',
  })
  entries!: AdminSkuStockLedgerEntryResponse[];

  @ApiProperty({
    description: 'True when older entries exist beyond this page.',
  })
  truncated!: boolean;
}

export type AdminSkuStockPayload = AdminSkuStockResponse;
export type AdminSkuStockLedgerPayload = AdminSkuStockLedgerResponse;
