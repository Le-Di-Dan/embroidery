/**
 * The two Admin order reads (`APP7-B02`).
 *
 * ```text
 * GET /api/admin/orders            — adminOrder_list
 * GET /api/admin/orders/{orderId}  — adminOrder_detail
 * ```
 *
 * Two, and no third. The lines are returned *inside* the detail rather than as a
 * separate collection: they are frozen children of the order, not resources
 * addressed on their own. There is no payment endpoint here either — no
 * obligation, attempt, evidence or verification route — because `APP7-B04` owns
 * Admin payment operations and a URL fixed now is a URL B04 would have to write
 * to before it knows what verifying one looks like.
 *
 * There is no mutation. The class holds two collaborators and both are queries;
 * neither can reach `OrderRepository`, so no route here can create an order,
 * move its status, freeze shipping or append an outbox event. Order creation
 * stays where `APP7-W01-C1` put it: one canonical implementation in
 * `@embroidery/persistence`, driven by the worker's `design.approved` consumer.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` is the exact guard `GET /api/staff/me` and every
 * Admin catalogue, request and customer-support route already use. This
 * controller parses no cookie, looks up no session and accepts no
 * caller-supplied Admin id: the operator's identity is derived server-side by
 * the guard and is never a parameter. There is no role check because there is no
 * role model — APP1-B01 is a binary authenticated-admin gate, and inventing a
 * permission matrix here would be a security model with no authority behind it.
 *
 * Both routes are `GET` and both are safe. The queue's one filter is a query
 * parameter because an order status is not a secret; no parameter here is a
 * contact, a code an operator was not given, or anything that would be worth
 * redacting from a gateway access log.
 */
import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import {
  ReadAdminOrderDetail,
  type AdminOrderDetailView,
} from '../application/admin/read-admin-order-detail.query';
import {
  ReadAdminOrderQueue,
  type AdminOrderQueueView,
} from '../application/admin/read-admin-order-queue.query';
import { guardedAdminOrderRead } from '../domain/admin/admin-order-read.errors';
import {
  AdminOrderDetailResponse,
  AdminOrderItemResponse,
  type AdminOrderDetailPayload,
} from './schemas/admin-order-detail.response';
import {
  AdminOrderQueueItemResponse,
  AdminOrderQueueResponse,
  PUBLISHED_ORDER_STATES,
  type AdminOrderQueueViewPayload,
} from './schemas/admin-order-queue.response';
import {
  AdminOrderIdParam,
  ListAdminOrdersQuery,
  listAdminOrdersQuerySchema,
} from './schemas/admin-order.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** An operational order queue must never be cached by a shared proxy. */
const ADMIN_ORDER_CACHE_CONTROL = 'no-store';

@ApiTags('adminOrder')
@ApiCookieAuth('adminSession')
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminOrderQueueResponse,
  AdminOrderQueueItemResponse,
  AdminOrderDetailResponse,
  AdminOrderItemResponse,
)
export class AdminOrderController {
  constructor(
    private readonly queue: ReadAdminOrderQueue,
    private readonly details: ReadAdminOrderDetail,
  ) {}

  @Get()
  @Header('Cache-Control', ADMIN_ORDER_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_ORDER_QUEUE_READ', 'Order queue retrieved.')
  @ApiOperation({
    summary: 'List orders for operational triage',
    description:
      'Keyset-paginated, newest first, with a stable `id` tie-breaker so a page boundary cannot ' +
      'repeat or skip a row while orders are being created. There is no offset paging and no ' +
      'total count. With no `status` filter the page carries every LC-14 state — orders have no ' +
      'canonical triage subset, so none is invented and nothing is silently hidden. Every value ' +
      'is a column of the order itself: the total is the frozen order total, never a sum over ' +
      'the lines or a current catalog price, and no product, variant, SKU or customer profile ' +
      'is read to enrich a row. Payment facts are not here — `APP7-B04` owns Admin payment ' +
      'operations — though an order that has reached `DEPOSIT_PAID` reports that as its own ' +
      'state.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    isArray: true,
    enum: PUBLISHED_ORDER_STATES,
    description: 'Repeatable. Omitted means every state.',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of orders.',
    schema: envelopeSchemaOf(AdminOrderQueueResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  async list(@Query() query: ListAdminOrdersQuery): Promise<AdminOrderQueueViewPayload> {
    // The global pipe already validated this query against the same schema; the
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = listAdminOrdersQuerySchema.parse(query);

    return guardedAdminOrderRead(async () =>
      toQueuePayload(
        await this.queue.list({
          cursor: input.cursor,
          limit: input.limit,
          statuses: input.status,
        }),
      ),
    );
  }

  @Get(':orderId')
  @Header('Cache-Control', ADMIN_ORDER_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_ORDER_DETAIL_READ', 'Order retrieved.')
  @ApiOperation({
    summary: 'Get one order with its frozen lines',
    description:
      'The order as it was frozen when the approved design was converted: its code, LC-14 ' +
      'state, request and customer linkage, the exact accepted quotation version and approval ' +
      'snapshot it was built from, the frozen total, and the ordered lines. Each line names ' +
      'exactly one subject — a catalog SKU or a customer-owned product — with the product name, ' +
      'variant and size labels **as stored**, not as Catalog reads today; a renamed product, a ' +
      'retired variant or a repriced SKU changes nothing here. Money is transported, never ' +
      'recomputed: no unit × quantity, no sum over lines, no deposit percentage. It is a read: ' +
      'nothing is written, no status moves and no audit event is appended. No payment attempt, ' +
      'transfer reference, evidence or provider field appears — `APP7-B04` owns those — and no ' +
      'storage key, token or session secret appears anywhere in the response.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The order and its frozen lines.',
    schema: envelopeSchemaOf(AdminOrderDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed order id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such order.', schema: ERROR_SCHEMA })
  async detail(@Param() params: AdminOrderIdParam): Promise<AdminOrderDetailPayload> {
    return guardedAdminOrderRead(async () =>
      toDetailPayload(await this.details.read(params.orderId)),
    );
  }
}

/**
 * The queue projection.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later.
 */
function toQueuePayload(view: AdminOrderQueueView): AdminOrderQueueViewPayload {
  return {
    items: view.items.map((item) => ({
      orderId: item.orderId,
      code: item.code,
      status: item.status,
      customRequestId: item.customRequestId,
      customerId: item.customerId,
      totalAmount: item.totalAmount,
      currencyCode: item.currencyCode,
      createdAt: item.createdAt.toISOString(),
    })),
    nextCursor: view.nextCursor,
    hasNext: view.hasNext,
  };
}

/** The detail projection. Same rule: an internal field has nowhere to land. */
function toDetailPayload(view: AdminOrderDetailView): AdminOrderDetailPayload {
  return {
    orderId: view.orderId,
    code: view.code,
    status: view.status,
    customRequestId: view.customRequestId,
    customerId: view.customerId,
    acceptedQuotationVersionId: view.acceptedQuotationVersionId,
    currentApprovalSnapshotId: view.currentApprovalSnapshotId,
    totalAmount: view.totalAmount,
    currencyCode: view.currencyCode,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    items: view.items.map((item) => ({
      position: item.position,
      subjectKind: item.subjectKind,
      skuId: item.skuId,
      customerOwnedProductId: item.customerOwnedProductId,
      productName: item.productName,
      variantLabel: item.variantLabel,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      lineTotalAmount: item.lineTotalAmount,
      currencyCode: item.currencyCode,
      approvalSnapshotId: item.approvalSnapshotId,
    })),
  };
}
