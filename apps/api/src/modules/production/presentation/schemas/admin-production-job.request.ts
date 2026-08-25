/**
 * Request-side validation for the three Admin production operations
 * (`APP8-B03` §3, §7.2, §11).
 *
 * Every schema is `.strict()`: an unknown query parameter or body field is a
 * client bug worth reporting, and silently dropping one is how an operator
 * believes they filtered something they did not.
 *
 * ### The filter list is two entries, and both are order- or job-owned
 *
 * `status` is answerable from `production_jobs.status`, and
 * `ix_production_jobs__created_id__active` (IDX-082) is partial on the two
 * active states, so filtering to them rides that index. `orderId` is equality on
 * `production_jobs.order_id`, backed by
 * `uq_production_jobs__order_approval_snapshot`'s leading column.
 *
 * Every other filter a production queue *could* carry has no accepted authority
 * behind it. There is deliberately **no `priority`** — no priority column
 * exists (`APP8-B03` §7.2, `APP8-G01` §7.2) — and no operator, machine, attempt
 * or SLA filter, for the same reason.
 */
import type { ProductionJobState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The statuses the filter accepts: the whole LC-18 vocabulary.
 *
 * Declared here as a local tuple rather than imported as a runtime value —
 * presentation must not pull the ORM schema namespace in
 * (`BACKEND_CONVENTIONS.md` §3) — with `satisfies` and the exhaustiveness proof
 * below tying it to the canonical union in both directions.
 */
export const PRODUCTION_STATUS_FILTERS = [
  'PLANNED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly ProductionJobState[];

type MissingProductionStatus = Exclude<
  ProductionJobState,
  (typeof PRODUCTION_STATUS_FILTERS)[number]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingProductionStatus = MissingProductionStatus extends never
  ? true
  : ['missing', MissingProductionStatus];

/**
 * One or many statuses from `?status=PLANNED&status=STARTED`.
 *
 * Express parses a repeated query key as an array and a single one as a string,
 * so the schema accepts both shapes and normalizes to an array. Without the
 * pre-processing a one-status filter and a two-status filter would take
 * different code paths through the same parameter. Identical to the shape
 * `APP7-B02`'s order queue already publishes, so a generated client treats the
 * two the same way.
 */
const statusFilterSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.enum(PRODUCTION_STATUS_FILTERS)).min(1).max(PRODUCTION_STATUS_FILTERS.length),
);

export const listProductionJobsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: statusFilterSchema.optional(),
    orderId: z.string().uuid().optional(),
  })
  .strict();

export class ListProductionJobsQuery extends createZodDto(listProductionJobsQuerySchema) {}

/** UUID path parameters — rejected before any repository call. */
export const productionJobIdParamSchema = z.object({ jobId: z.string().uuid() }).strict();

export class ProductionJobIdParam extends createZodDto(productionJobIdParamSchema) {}

export const productionOrderIdParamSchema = z.object({ orderId: z.string().uuid() }).strict();

export class ProductionOrderIdParam extends createZodDto(productionOrderIdParamSchema) {}

/**
 * The creation body — two optional fields, and nothing a server owns.
 *
 * `approvalSnapshotId` is a **confirmation**, never a selection: the use case
 * resolves the authoritative id from `orders.current_approval_snapshot_id` and
 * refuses a request that names a different one (§5.3). Accepting it is what
 * lets a caller that believes it knows the approval find out that it does not,
 * instead of silently producing against another one.
 *
 * `productionParameters` is the one free-text machine note
 * `production_specifications` already stores, frozen with the rest of the
 * specification. Bounded so a body cannot carry a document.
 *
 * There is no `status`, no `jobId`, no `adminId`, no `correlationId`, no
 * quantity and no dimension: `TR-LC18-01` fixes the state at `PLANNED`, the
 * guard binds the identity, and every specification value is copied from the
 * approval by the repository (§5.4).
 */
export const createProductionJobBodySchema = z
  .object({
    approvalSnapshotId: z.string().uuid().optional(),
    productionParameters: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export class CreateProductionJobBody extends createZodDto(createProductionJobBodySchema) {}

registerZodDtos(
  ListProductionJobsQuery,
  ProductionJobIdParam,
  ProductionOrderIdParam,
  CreateProductionJobBody,
);
