/**
 * The three Admin stock operations (`APP8-B01`).
 *
 * ```text
 * GET  /api/admin/skus/{skuId}/stock             — adminSkuStock_get
 * POST /api/admin/skus/{skuId}/stock/adjustments — adminSkuStock_adjust
 * GET  /api/admin/skus/{skuId}/stock/ledger      — adminSkuStock_ledger
 * ```
 *
 * Three, and no fourth. There is no `PUT /stock` and no set-absolute operation:
 * the delivered repository authority is delta-based, and an absolute write
 * would discard whatever a concurrent transaction had just committed. There is
 * no `DELETE` on a ledger entry either — `inventory_ledger_entries` is
 * append-only (CST-098), and the surface says so by having no route that could
 * address one. There is no reservation, hold or production route: those belong
 * to `APP8-B02`, `W01`, `B03` and `B04`.
 *
 * ### The SKU is the resource, and the anchor is created under it
 *
 * All three routes address `skus/{skuId}/stock`. Stock is a property of a SKU
 * (`sku_stocks` is 1–1 with `skus`, CST-014), so the SKU is the locator and the
 * stock row is never addressed by its own id from outside — an operator holds
 * SKU ids, not anchor ids, and publishing a second locator would let the two
 * disagree.
 *
 * `APP7-B01`'s `AdminSkuController` already publishes `PATCH admin/skus/{skuId}`,
 * so this base path is shared rather than new. That is safe and deliberate: the
 * three routes here each add a `stock` segment, so Nest matches on segment
 * count and method and no registration order can make one shadow another. They
 * remain two modules because SKU *authoring* holds the variant lock and the
 * order-eligibility rule, and a stock route must not be able to reach either.
 *
 * **A COP subject has no SKU and therefore reaches none of these
 * routes**: `APP8-G01` `PO-APP8-001` fabricates no SKU, no `sku_stocks` row and
 * no reservation for the COP branch, and a surface keyed on `skuId` is what
 * makes that unrepresentable rather than merely avoided.
 *
 * ### A read that may write, deliberately
 *
 * Both GETs ensure the SKU's stock anchor. That is `APP8-B01` §5's chosen
 * Gap A closure and it is idempotent by `uq_sku_stocks__sku`: the first read of
 * a never-counted SKU creates its zero-quantity anchor, every later one finds
 * it. The alternative was a `404` for a SKU whose real stock is zero, and no
 * way to reach the adjustment that would fix it.
 *
 * ### Authentication and mutation protection are APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, plus `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on the one mutation — the exact combination every Admin
 * mutation in this repository already uses. No cookie is parsed here, no
 * session is looked up, and no handler accepts an operator identity: the Admin
 * id is bound by the guard and read from the request context inside the use
 * case.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { AdjustSkuStockUseCase } from '../application/admin/adjust-sku-stock.use-case';
import { ReadSkuStockQuery } from '../application/admin/read-sku-stock.query';
import { ReadSkuStockLedgerQuery } from '../application/admin/read-sku-stock-ledger.query';
import type { SkuStockLedgerView, SkuStockView } from '../application/admin/sku-stock.view';
import { guardedStockOperation } from '../domain/stock-operations.errors';
import { AdjustSkuStockBody, AdminSkuStockParam } from './schemas/admin-sku-stock.request';
import {
  AdminSkuStockLedgerResponse,
  AdminSkuStockResponse,
  type AdminSkuStockLedgerPayload,
  type AdminSkuStockPayload,
} from './schemas/admin-sku-stock.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const NOT_FOUND = {
  status: 404,
  description: 'No such SKU.',
  schema: ERROR_SCHEMA,
} as const;

const UNAUTHENTICATED = {
  status: 401,
  description: 'No live Admin session.',
  schema: ERROR_SCHEMA,
} as const;

@ApiTags('adminSkuStock')
@ApiCookieAuth('adminSession')
@Controller('admin/skus')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminSkuStockResponse, AdminSkuStockLedgerResponse)
export class AdminSkuStockController {
  constructor(
    private readonly stock: ReadSkuStockQuery,
    private readonly adjustments: AdjustSkuStockUseCase,
    private readonly ledgerReads: ReadSkuStockLedgerQuery,
  ) {}

  @Get(':skuId/stock')
  @ApiSuccessCode('SKU_STOCK_READ', 'SKU stock read.')
  @ApiOperation({
    summary: 'Read one Catalog SKU stock record and its availability',
    description:
      'The operational truth about one SKU: what is on hand, what is held, what is reserved, ' +
      'and what is therefore available. Availability is computed under the `sku_stocks` row ' +
      'lock as `on hand − holds − reservations` and is never stored, so the figure is exactly ' +
      'as current as the transaction that produced it. A SKU that has never been counted gains ' +
      'its zero-quantity stock anchor on this first read and is reported as having nothing ' +
      'available — which is true — rather than being refused. Repeating the read creates no ' +
      'second anchor. A customer-owned product has no SKU and no stock record, and reaches ' +
      'this operation not at all.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The stock state of that SKU.',
    schema: envelopeSchemaOf(AdminSkuStockResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed SKU id.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(NOT_FOUND)
  async get(@Param() params: AdminSkuStockParam): Promise<AdminSkuStockPayload> {
    return guardedStockOperation(async () => toStockPayload(await this.stock.read(params.skuId)));
  }

  /**
   * 200, not 201: no resource is addressable afterwards. The adjustment appends
   * a ledger entry the operator cannot later fetch by id — the ledger is read
   * as a SKU's history, never as an addressable row — so there is no location
   * to return and nothing new to name.
   */
  @Post(':skuId/stock/adjustments')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('SKU_STOCK_ADJUSTED', 'SKU stock adjusted.')
  @ApiOperation({
    summary: 'Apply one audited stock adjustment to a Catalog SKU',
    description:
      'The only operation that moves `quantityOnHand`, and the only way stock ever enters the ' +
      'system. The delta is signed whole units and a reason is mandatory (GRD-023): stock that ' +
      'changed for no recorded reason cannot be reconciled against the ledger. Under the ' +
      '`sku_stocks` row lock the server applies the delta, appends exactly one `ADJUSTMENT` ' +
      'ledger entry carrying that reason, and records the operator, the correlation id and the ' +
      'quantity before and after as an audit event — all atomically, or none of it. An ' +
      'adjustment that would take stock below zero is refused and writes nothing at all. This ' +
      'is not a set-absolute operation: two operators counting at once must not silently ' +
      'discard each other’s work.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiBody({ type: AdjustSkuStockBody })
  @ApiResponse({
    status: 200,
    description: 'The committed stock state, recomputed after the adjustment.',
    schema: envelopeSchemaOf(AdminSkuStockResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed SKU id or body: a zero delta, a fractional delta, or a blank reason.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description: 'The adjustment would take stock below zero. Nothing changed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async adjust(
    @Param() params: AdminSkuStockParam,
    @Body() body: AdjustSkuStockBody,
  ): Promise<AdminSkuStockPayload> {
    return guardedStockOperation(async () =>
      toStockPayload(
        await this.adjustments.adjust({
          skuId: params.skuId,
          delta: body.delta,
          reason: body.reason,
        }),
      ),
    );
  }

  @Get(':skuId/stock/ledger')
  @ApiSuccessCode('SKU_STOCK_LEDGER_READ', 'SKU stock ledger read.')
  @ApiOperation({
    summary: 'Read the movement history behind one SKU stock record',
    description:
      'Every movement recorded against this SKU’s stock — adjustments, holds, reservations and ' +
      'consumption — newest first, with the mandatory reason on each adjustment. The ledger is ' +
      'append-only and is the rebuild source of truth: summing `onHandDelta` reproduces ' +
      '`quantityOnHand`. It carries no order, no customer and no reservation holder; who acted ' +
      'on an adjustment is recorded on its audit event, not here. At most 100 entries are ' +
      'returned and `truncated` says when older ones exist.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The ledger page of that SKU.',
    schema: envelopeSchemaOf(AdminSkuStockLedgerResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed SKU id.', schema: ERROR_SCHEMA })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(NOT_FOUND)
  async ledger(@Param() params: AdminSkuStockParam): Promise<AdminSkuStockLedgerPayload> {
    return guardedStockOperation(async () =>
      toLedgerPayload(await this.ledgerReads.read(params.skuId)),
    );
  }
}

/** The receipt. Field by field, so an internal fact has nowhere to land. */
function toStockPayload(view: SkuStockView): AdminSkuStockPayload {
  return {
    skuId: view.skuId,
    skuStockId: view.skuStockId,
    quantityOnHand: view.quantityOnHand,
    heldQuantity: view.heldQuantity,
    reservedQuantity: view.reservedQuantity,
    available: view.available,
    ...(view.lowStockThreshold === undefined ? {} : { lowStockThreshold: view.lowStockThreshold }),
    lowStock: view.lowStock,
  };
}

function toLedgerPayload(view: SkuStockLedgerView): AdminSkuStockLedgerPayload {
  return {
    skuId: view.skuId,
    skuStockId: view.skuStockId,
    entries: view.entries.map((entry) => ({
      entryKind: entry.entryKind,
      quantity: entry.quantity,
      onHandDelta: entry.onHandDelta,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      occurredAt: entry.occurredAt.toISOString(),
    })),
    truncated: view.truncated,
  };
}
