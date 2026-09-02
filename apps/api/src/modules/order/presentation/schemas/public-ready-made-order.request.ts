/**
 * The request contract for `POST /api/public/ready-made-orders` (`APP12-B02`).
 *
 * Everything the server owns is **absent by construction** and rejected by
 * `.strict()`. There is no field for, and no way to send:
 *
 * ```text
 * productId          product name        variant label       size label
 * unit price         line total          currency            shipping fee
 * final total        available quantity  order status        origin
 * reservation expiry order id            order code          customerId
 * idempotency key    correlation id
 * ```
 *
 * A caller states which SKU it wants, how many, where it goes, and proves who
 * it is with a challenge id. Every other fact is derived server-side
 * (`BR-021`), so there is no client value for a later edit to start trusting.
 *
 * ### `skuId`, not `productId` + `productVariantId`
 *
 * The buyable subject is the SKU (`BR-021`), and `APP12-B01` publishes SKU ids
 * on the public variant read for exactly this call. Accepting a product and a
 * variant as well would give the server three client-supplied ids that could
 * disagree with each other, and the SKU already determines the other two.
 *
 * ### There is no idempotency header
 *
 * `challengeId` is the idempotency scope, on `ADR-DB1-017` and the reasoning in
 * `ready-made-order-idempotency.ts`: it is server-issued, already mandatory,
 * naturally one-to-one with an order, and bounded. A client-minted key would be
 * a value a client could choose to collide.
 *
 * ### The delivery fields mirror `shipping_details`
 *
 * Each optional field is optional because the **column** is nullable, never
 * because omitting it means "leave it alone" — this is a creation, so there is
 * nothing to leave alone. `countryCode`, `currencyCode`, `feeAmount`,
 * `carrierName`, `trackingCode`, `status` and `frozenAt` are absent: the
 * country has a column default, the currency is CHECK-pinned to VND, and the
 * rest belong to `APP12-B03` and the fulfilment path. A customer cannot state
 * their own shipping fee (`BR-027`).
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** Row identifiers as `idColumn()` issues them. */
const rowId = z.string().uuid();

/**
 * The per-order quantity ceiling.
 *
 * `ck_order_items__quantity_positive` is the database's rule and it is only
 * `> 0`; the real ceiling on any given order is available stock, decided under
 * the anchor lock. This bound exists so an unbounded integer cannot arrive in a
 * public body at all — the same value and the same reason as the delivered
 * `MAX_QUANTITY_PER_LINE` on the custom-request contract, so one customer-stated
 * quantity means the same thing on both public writes. It is deliberately not a
 * low "reasonable purchase" figure invented here: that would be a business rule
 * no locked authority states.
 */
const MAX_QUANTITY = 100_000;

const deliverySchema = z
  .object({
    recipientName: z.string().trim().min(1).max(200),
    recipientPhone: z.string().trim().min(1).max(32),
    addressLine: z.string().trim().min(1).max(500),
    ward: z.string().trim().min(1).max(200).optional(),
    district: z.string().trim().min(1).max(200).optional(),
    province: z.string().trim().min(1).max(200),
  })
  .strict()
  .meta({
    id: 'ReadyMadeOrderDelivery',
    description:
      'Where the order is delivered. Vietnamese administrative shape, as shipping_details ' +
      'stores it. No fee, no carrier and no tracking: the operator sets those.',
  });

export const createReadyMadeOrderSchema = z
  .object({
    challengeId: rowId.meta({
      description:
        'A VERIFIED, unexpired SUBMISSION-purpose verification challenge. It authorizes the ' +
        'order and is also its idempotency scope: re-sending the same body replays the same ' +
        'result instead of creating a second order.',
    }),
    skuId: rowId.meta({
      description:
        'The SKU to buy, from the public product variant read. Availability and price are ' +
        're-resolved server-side; the values that read returned are advisory only.',
    }),
    quantity: z.number().int().positive().max(MAX_QUANTITY).meta({
      description: 'How many units. Refused if it exceeds available stock at commit time.',
    }),
    delivery: deliverySchema,
  })
  .strict()
  .meta({
    description:
      'Places one Ready-Made order for one SKU. The server resolves the customer, the price ' +
      'and the stock; no amount is accepted from the client.',
  });

export type CreateReadyMadeOrderInput = z.infer<typeof createReadyMadeOrderSchema>;

export class CreateReadyMadeOrderBody extends createZodDto(createReadyMadeOrderSchema) {}

registerZodDtos(CreateReadyMadeOrderBody);
