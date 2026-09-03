/**
 * Request-side validation for the two Admin order reads (`APP7-B02` §5, §12).
 *
 * Both schemas are `.strict()`: an unknown query parameter is a client bug worth
 * reporting, and silently dropping one is how an operator believes they filtered
 * something they did not.
 *
 * The filter list is deliberately one entry long. `status` is answerable from
 * the leading column of `ix_orders__status_created_id` (IDX-074, the index DB5
 * created for the Admin order queue), so it costs nothing and hides nothing.
 * Every other filter a list endpoint *could* carry — product or SKU search, a
 * live Catalog category, a payment provider, an evidence or reconciliation
 * state, an inventory or production state — has no accepted APP7 authority
 * behind it, and two of those belong to checkpoints that do not exist yet
 * (`APP7-B04` owns payment operational visibility, APP8 owns
 * inventory/production). A filter added because the SQL would support it is a
 * contract nothing asked for.
 */
import type { OrderOrigin, OrderState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The statuses the filter accepts: the whole LC-14 vocabulary.
 *
 * Declared here as a local tuple rather than imported as a runtime value —
 * presentation must not pull the ORM schema namespace in
 * (`BACKEND_CONVENTIONS.md` §3) — with `satisfies` and the exhaustiveness proof
 * below tying it to the canonical union in both directions.
 *
 * All eleven are accepted, including the ones APP7 offers no action in. The
 * queue reports the **stored** status, and refusing `IN_PRODUCTION` here would
 * make the endpoint claim the database cannot hold a value it does hold.
 *
 * APP12-DB01 widened the `orders.status` column vocabulary to thirteen by adding
 * the two Ready-Made states, and `APP7-B02` deliberately left the published set
 * at the eleven custom ones because no order could hold a Ready-Made state yet.
 * `APP12-B02` then made those orders real, so **`APP12-A02-C1` publishes all
 * thirteen** — the decision `APP7-B02` said belonged to this checkpoint.
 *
 * The exhaustiveness proof below is therefore taken against `OrderState`, the
 * whole column vocabulary. Nothing invented is added beside it: there is no
 * `PAID` (satisfaction is the obligation's fact under LC-15, never a second
 * copy on the order) and no `EXPIRED` (a lapsed reservation cancels the order
 * and the machine-readable reason rides on the customer projection), and a
 * filter value the database cannot store would be a promise no row can keep.
 */
export const ORDER_STATUS_FILTERS = [
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'IN_PRODUCTION',
  'PRODUCTION_COMPLETED',
  'AWAITING_FINAL_PAYMENT',
  'AWAITING_SHIPPING_FEE',
  'AWAITING_PAYMENT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLING',
  'CANCELLED',
] as const satisfies readonly OrderState[];

type MissingOrderStatus = Exclude<OrderState, (typeof ORDER_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingOrderStatus = MissingOrderStatus extends never
  ? true
  : ['missing', MissingOrderStatus];

/**
 * One or many statuses from `?status=AWAITING_DEPOSIT&status=DEPOSIT_PAID`.
 *
 * Express parses a repeated query key as an array and a single one as a string,
 * so the schema accepts both shapes and normalizes to an array. Without the
 * pre-processing a one-status filter and a two-status filter would take
 * different code paths through the same parameter.
 */
const statusFilterSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.enum(ORDER_STATUS_FILTERS)).min(1).max(ORDER_STATUS_FILTERS.length),
);

/**
 * The two order origins (`APP12-A02-C1`, `COL-TBL043-12`).
 *
 * A local tuple for the same reason `ORDER_STATUS_FILTERS` is one —
 * presentation must not pull the ORM schema namespace in — with `satisfies` and
 * the proof below tying it to the canonical union in both directions, so a
 * third origin cannot be added to the database without this filter failing to
 * compile.
 */
export const ORDER_ORIGIN_FILTERS = [
  'CUSTOM',
  'READY_MADE',
] as const satisfies readonly OrderOrigin[];

type MissingOrderOrigin = Exclude<OrderOrigin, (typeof ORDER_ORIGIN_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingOrderOrigin = MissingOrderOrigin extends never
  ? true
  : ['missing', MissingOrderOrigin];

/**
 * One or many origins, normalized exactly as `status` is.
 *
 * Repeatable rather than a single value, so the filter has one shape whether an
 * operator narrows to one origin or explicitly asks for both. Omitting it is
 * how you ask for every origin; there is no `ALL` sentinel to get wrong.
 */
const originFilterSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.enum(ORDER_ORIGIN_FILTERS)).min(1).max(ORDER_ORIGIN_FILTERS.length),
);

export const listAdminOrdersQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: statusFilterSchema.optional(),
    origin: originFilterSchema.optional(),
  })
  .strict();

export class ListAdminOrdersQuery extends createZodDto(listAdminOrdersQuerySchema) {}

/** UUID path parameter — rejected before any repository call. */
export const adminOrderIdParamSchema = z.object({ orderId: z.string().uuid() }).strict();

export class AdminOrderIdParam extends createZodDto(adminOrderIdParamSchema) {}

registerZodDtos(ListAdminOrdersQuery, AdminOrderIdParam);
