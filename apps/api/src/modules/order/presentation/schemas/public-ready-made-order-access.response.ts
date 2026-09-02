/**
 * The `APP12-B04` secure Ready-Made order projection (§12, §13).
 *
 * What the customer's own order page renders, and nothing beyond it. Every
 * omission is listed on `ReadyMadeOrderView`; the short version is that no
 * internal identifier of any kind appears here — not the order UUID, the
 * customer, the SKU, the stock, the reservation, the obligation, an attempt, a
 * grant or an audit row — because `BR-032` keeps them off the customer surface
 * and no operation on this surface accepts one.
 *
 * ### Three money fields, and why they are three
 *
 * `merchandiseSubtotal`, `delivery.feeAmount` and `payment.payableTotal` are
 * published separately rather than as one total, so the page can show the
 * composition the customer agreed to. The API performs no arithmetic between
 * them: the subtotal is the order's frozen line total, the fee is the operator's
 * exact figure, and the payable total is the live obligation's own amount, which
 * `APP12-B03` composed once. A client that added the first two would usually
 * get the third — and after a fee correction, would get it too, because the
 * obligation was recomposed rather than adjusted — but the authority is
 * `payableTotal` and it is the figure an Admin verifies against.
 *
 * ### The terminal distinction, published beside the status
 *
 * `APP12-D01` §I renders `CANCELLED` and `EXPIRED` as distinct customer
 * states. The order's lifecycle has one terminal status, so the cause travels
 * in `terminationReason` — a value the client selects a page variant from,
 * rather than a sentence it would have to read. There is no `EXPIRED` order
 * status and no second lifecycle behind this field.
 *
 * ### Two deliberate absences on the same object
 *
 * `delivery.feeAmount` and `payment` are both missing before an operator prices
 * delivery. Neither is defaulted: `BR-027` makes "not priced yet" and "free"
 * different answers, and makes the merchandise subtotal an amount nobody owes.
 * That pair is exactly the `AWAITING_SHIPPING_FEE` page variant `APP12-D01` §I
 * describes — no total, no QR.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

import { ORDER_TERMINATION_REASONS } from '../../domain/ready-made/order-termination-reason';

const AMOUNT = {
  type: String,
  example: '250000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

export class ReadyMadeOrderItemResponse {
  @ApiProperty({
    example: 'Áo thun cotton basic',
    description:
      'The product name **as it was when the order was placed**, snapshotted onto the line. ' +
      'A later Catalog rename does not change it.',
  })
  productName!: string;

  @ApiProperty({
    required: false,
    example: 'Trắng',
    description:
      'The variant the customer bought, if the SKU has one. Absent when the product has no ' +
      'variant attribute — never "N/A" or an empty string.',
  })
  variantLabel?: string;

  @ApiProperty({
    required: false,
    example: 'L',
    description: 'The size the customer bought, if the SKU has one. Absent on the same terms.',
  })
  sizeLabel?: string;

  @ApiProperty({ example: 2, description: 'How many units were bought.' })
  quantity!: number;

  @ApiProperty({ ...AMOUNT, example: '125000.00', description: 'Frozen unit price.' })
  unitPriceAmount!: string;

  @ApiProperty({
    ...AMOUNT,
    description: 'Frozen line total — unit price x quantity, taken at order creation.',
  })
  lineTotalAmount!: string;

  @ApiProperty({ example: 'VND', description: 'The line’s own currency.' })
  currencyCode!: string;
}

export class ReadyMadeOrderDeliveryResponse {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Who the order is for.' })
  recipientName!: string;

  @ApiProperty({ example: '0901234567', description: 'The delivery contact number.' })
  recipientPhone!: string;

  @ApiProperty({ example: '12 Nguyễn Huệ', description: 'Street address.' })
  addressLine!: string;

  @ApiProperty({ required: false, example: 'Phường Bến Nghé', description: 'Ward, if given.' })
  ward?: string;

  @ApiProperty({ required: false, example: 'Quận 1', description: 'District, if given.' })
  district?: string;

  @ApiProperty({ example: 'TP. Hồ Chí Minh', description: 'Province or city.' })
  province!: string;

  @ApiProperty({
    required: false,
    ...AMOUNT,
    example: '30000.00',
    description:
      'The exact shipping fee an operator set. **Absent** until they have — which is not the ' +
      'same as free, and is why no zero is sent. While it is absent the order is not payable ' +
      'and `payment` is absent too.',
  })
  feeAmount?: string;
}

export class ReadyMadeOrderPaymentResponse {
  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_STATES,
    example: 'PENDING',
    description:
      'The payment obligation’s own state. `SATISFIED` means an Admin confirmed receipt of ' +
      'the transfer. A Ready-Made order has exactly one obligation and no deposit (BR-029).',
  })
  status!: string;

  @ApiProperty({
    ...AMOUNT,
    example: '280000.00',
    description:
      'The exact amount owed: the frozen merchandise subtotal plus the exact shipping fee, ' +
      'composed once when the fee was set and read back verbatim. After a shipping-fee ' +
      'correction this is the corrected figure — the obligation is recomposed from the ' +
      'frozen subtotal rather than adjusted, so two corrections do not compound. This is the ' +
      'authoritative total; it is not re-derived from the two fields above.',
  })
  payableTotal!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether payment may be made right now: the order is AWAITING_PAYMENT and the ' +
      'obligation is still PENDING. Derived on every read and stored nowhere. The QR and a ' +
      'new payment attempt are refused when it is false.',
  })
  payable!: boolean;
}

export class ReadyMadeOrderAccessResponse {
  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description:
      'The customer-facing order code. Display and support only — a code is never an ' +
      'authorization input (CST-026, ADR-DB1-007).',
  })
  orderCode!: string;

  @ApiProperty({
    enum: schema.READY_MADE_ORDER_STATES,
    example: 'AWAITING_PAYMENT',
    description:
      'The order’s own state. `AWAITING_SHIPPING_FEE` means an operator has not priced ' +
      'delivery yet, so there is no total to pay; `AWAITING_PAYMENT` means there is. ' +
      '`READY_FOR_DELIVERY` appears only after an Admin has verified that the money arrived. ' +
      '`CANCELLED` is where a lapsed stock reservation puts the order — its payment, QR and ' +
      'new attempts all become unavailable and are not revived.',
  })
  status!: string;

  @ApiProperty({
    required: false,
    enum: ORDER_TERMINATION_REASONS,
    example: 'RESERVATION_EXPIRED',
    description:
      'Why a terminal order ended, when that is a recorded fact rather than an inference. ' +
      'RESERVATION_EXPIRED means the stock reservation lapsed before the order was paid ' +
      'for, so the shop released the stock and closed the order — the state a client renders ' +
      'differently from an ordinary cancellation. It is derived from the reservation’s own ' +
      'committed status, which the expiry sweep writes in the same transaction as the ' +
      'cancellation, and never from any free-text reason. **Absent** means the order was not ' +
      'classified as an expiry — which is not the same as "not cancelled", and `status` is what ' +
      'says that. A cancelled order with no reason here is an ordinary cancellation.',
  })
  terminationReason?: string;

  @ApiProperty({ example: 'VND', description: 'The order’s own currency.' })
  currencyCode!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the order was placed, as the database recorded it.',
  })
  placedAt!: string;

  @ApiProperty({ type: ReadyMadeOrderItemResponse, description: 'The one SKU line, frozen.' })
  item!: ReadyMadeOrderItemResponse;

  @ApiProperty({
    ...AMOUNT,
    description:
      'The frozen merchandise subtotal — the line total, excluding delivery. It is never the ' +
      'amount to pay: before the shipping fee there is no payable total at all, and after it ' +
      '`payment.payableTotal` is the authority.',
  })
  merchandiseSubtotal!: string;

  @ApiProperty({
    required: false,
    type: ReadyMadeOrderDeliveryResponse,
    description:
      'Where the order is going, and what delivery costs so far. Absent only if the order ' +
      'carries no delivery record, which order creation makes impossible.',
  })
  delivery?: ReadyMadeOrderDeliveryResponse;

  @ApiProperty({
    required: false,
    type: ReadyMadeOrderPaymentResponse,
    description:
      'What is owed, once there is anything owed. **Absent** while the order is ' +
      'AWAITING_SHIPPING_FEE: no obligation exists yet, so there is no amount, no transfer ' +
      'reference and no QR. It is also absent once a cancelled order’s obligation has been ' +
      'cancelled with it.',
  })
  payment?: ReadyMadeOrderPaymentResponse;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'When the reserved stock is released if the order has not been paid for. Read from the ' +
      'reservation itself, never recomputed on this request. **Absent** once no live ' +
      'reservation stands — the window lapsed, the stock was released, or it was consumed at ' +
      'dispatch — which is exactly when a countdown must stop being shown.',
  })
  paymentDeadline?: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this secure link stops opening the order.',
  })
  accessExpiresAt!: string;
}

/** What the controller returns; the envelope wraps it. */
export interface ReadyMadeOrderAccessHttpView {
  readonly orderCode: string;
  readonly status: string;
  readonly terminationReason?: string;
  readonly currencyCode: string;
  readonly placedAt: string;
  readonly item: {
    readonly productName: string;
    readonly variantLabel?: string;
    readonly sizeLabel?: string;
    readonly quantity: number;
    readonly unitPriceAmount: string;
    readonly lineTotalAmount: string;
    readonly currencyCode: string;
  };
  readonly merchandiseSubtotal: string;
  readonly delivery?: {
    readonly recipientName: string;
    readonly recipientPhone: string;
    readonly addressLine: string;
    readonly ward?: string;
    readonly district?: string;
    readonly province: string;
    readonly feeAmount?: string;
  };
  readonly payment?: {
    readonly status: string;
    readonly payableTotal: string;
    readonly payable: boolean;
  };
  readonly paymentDeadline?: string;
  readonly accessExpiresAt: string;
}
