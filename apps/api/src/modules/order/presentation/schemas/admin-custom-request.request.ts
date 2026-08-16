/**
 * Request-side validation for the two Admin request reads (`APP5-B04` §6, §14).
 *
 * Both schemas are `.strict()`: an unknown query parameter is a client bug worth
 * reporting, and silently dropping one is how an operator believes they filtered
 * something they did not.
 *
 * There is no generic query language here — no field/operator/value triples, no
 * free-text search and no sort parameter. The filters are a closed list drawn
 * from the approved queue design (`FIG-APP5-A01-QUEUE-*`) and every one of them
 * is answerable from a column the database already indexes (§13).
 */
import type { ContactKind, CustomRequestState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The statuses the filter accepts: the whole LC-11 vocabulary.
 *
 * Declared here rather than imported as a runtime value — presentation must not
 * pull the ORM schema namespace in (`BACKEND_CONVENTIONS.md` §3) — with
 * `satisfies` and the exhaustiveness proof tying it to the canonical union in
 * both directions.
 *
 * All ten are accepted even though the queue's *default* is the three-state
 * triage set: `APP5-B04` §6 requires a specifically requested canonical status
 * to remain truthful and readable. Refusing `QUOTED` here would make the queue
 * claim the database cannot hold a value it does hold.
 */
const REQUEST_STATUS_FILTERS = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly CustomRequestState[];

type MissingStatus = Exclude<CustomRequestState, (typeof REQUEST_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingStatus = MissingStatus extends never ? true : ['missing', MissingStatus];

const CONTACT_KINDS = ['EMAIL', 'PHONE'] as const satisfies readonly ContactKind[];

export const REQUEST_SUBJECT_KINDS = ['CATALOG', 'CUSTOMER_OWNED'] as const;

/**
 * The request code, as an operator types it.
 *
 * `REQ-` plus ten CSPRNG characters (`APP5-G01` §5), matched **whole** and
 * uppercased before it reaches the query. It is an equality filter on the
 * `uq_custom_requests__code` unique index — not a prefix, substring or fuzzy
 * search — because a code identifies exactly one request and a partial-match
 * scan over a unique index is a table scan wearing an index's name.
 *
 * The code remains display-only: it selects a row an authenticated operator may
 * already read, and is never an authorization input (`APP5-G01` §5).
 */
const requestCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^REQ-[0-9A-Z]{10}$/, 'A request code is REQ- followed by ten characters.');

/**
 * One or many statuses from `?status=NEW&status=UNDER_REVIEW`.
 *
 * Express parses a repeated query key as an array and a single one as a string,
 * so the schema accepts both shapes and normalizes to an array. Without the
 * pre-processing a one-status filter and a two-status filter would take
 * different code paths through the same parameter.
 */
const statusFilterSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(z.enum(REQUEST_STATUS_FILTERS)).min(1).max(REQUEST_STATUS_FILTERS.length),
);

export const listAdminCustomRequestsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: statusFilterSchema.optional(),
    subjectKind: z.enum(REQUEST_SUBJECT_KINDS).optional(),
    code: requestCodeSchema.optional(),
    submittedFrom: z.string().datetime({ offset: true }).optional(),
    submittedTo: z.string().datetime({ offset: true }).optional(),
    contactKind: z.enum(CONTACT_KINDS).optional(),
    /**
     * The contact to filter by, matched whole after canonical normalization.
     *
     * Bounded at 254 characters — the longest address the email normalizer
     * accepts — so a hostile value cannot force a large normalization.
     */
    contact: z.string().trim().min(1).max(254).optional(),
  })
  .strict()
  // Both halves of the contact filter or neither. One without the other is
  // ambiguous — a kind with no value would filter nothing while looking like a
  // filter, and a value with no kind cannot be normalized at all.
  .refine((query) => (query.contactKind === undefined) === (query.contact === undefined), {
    message: 'contactKind and contact must be supplied together.',
  })
  // An inverted range is a client bug, and answering it with an empty page would
  // look like "no requests in this window" rather than "this window is empty by
  // construction".
  .refine(
    (query) =>
      query.submittedFrom === undefined ||
      query.submittedTo === undefined ||
      query.submittedFrom <= query.submittedTo,
    { message: 'submittedFrom must not be after submittedTo.' },
  );

export class ListAdminCustomRequestsQuery extends createZodDto(
  listAdminCustomRequestsQuerySchema,
) {}

/** UUID path parameter — rejected before any repository call. */
export const adminCustomRequestIdParamSchema = z.object({ requestId: z.string().uuid() }).strict();

export class AdminCustomRequestIdParam extends createZodDto(adminCustomRequestIdParamSchema) {}

registerZodDtos(ListAdminCustomRequestsQuery, AdminCustomRequestIdParam);
