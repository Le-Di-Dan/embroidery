/**
 * The request contract for `POST /api/public/custom-requests` (`APP5-B01`).
 *
 * Everything the server owns is **absent by construction** and rejected by
 * `.strict()`: no `customerId`, no request id, no `code`, no `status`, no
 * `submittedSessionId`, no design document, no grant, no storage key, no
 * idempotency key and no correlation id. A caller states what it wants made and
 * proves who it is with a challenge id; every other fact is derived.
 *
 * ### Two branch objects, not a discriminated union
 *
 * `APP5-G01` §3 requires a **named** refusal — `SUBMISSION_SUBJECT_INVALID` —
 * for both-present and neither-present. A discriminated union makes those two
 * cases unsayable and the API would answer a shape complaint instead, so the
 * exclusivity is decided in the application, where DB4 puts it (*"no same-row
 * CHECK can see it and none is faked"*). Each branch object is nevertheless
 * complete and `.strict()`: "catalog present" cannot mean "half a catalog
 * subject", and `productVariantId` is required rather than optional
 * (`G01-D08`).
 *
 * ### `designSessionId` is not a credential
 *
 * It names which session to submit. Authorization is the per-session
 * `__Host-` cookie APP3 issues, verified by APP3's own service before this body
 * is acted on; an id alone submits nothing.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { APP5_REQUEST_ASSET_ROLES } from '../../domain/submission/request-asset-policy';

/** Row identifiers as `idColumn()` issues them. */
const rowId = z.string().uuid();

/** `ck_custom_request_quantity_breakdowns__quantity_positive` — a line is units. */
const MAX_QUANTITY_PER_LINE = 100_000;

/** Bounded so a size label cannot become a free-text channel into the record. */
const sizeLabel = z.string().trim().min(1).max(50);

const decimalMillimetres = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Must be a positive measurement in millimetres.')
  .refine((value) => Number(value) > 0, 'Must be greater than zero.');

const catalogSubjectSchema = z
  .object({
    productId: rowId.meta({ description: 'Published Product the request is for.' }),
    productVariantId: rowId.meta({
      description: 'Exact Product Variant. Required — a request without one cannot be quoted.',
    }),
    designSessionId: rowId.meta({
      description:
        'The ACTIVE Design Session to submit. Authorized by its own session cookie, not by this id.',
    }),
  })
  .strict()
  .meta({ id: 'CustomRequestCatalogSubject' });

const customerOwnedProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).meta({
      description: 'What the customer calls the garment they already own.',
    }),
    description: z.string().trim().min(1).max(2000).optional(),
    physicalWidthMm: decimalMillimetres.optional(),
    physicalHeightMm: decimalMillimetres.optional(),
  })
  .strict()
  .meta({ id: 'CustomRequestCustomerOwnedProduct' });

const quantityLineSchema = z
  .object({
    sizeLabel: sizeLabel.optional(),
    quantity: z.number().int().positive().max(MAX_QUANTITY_PER_LINE),
  })
  .strict()
  .meta({ id: 'CustomRequestQuantityLine' });

const requestAssetSchema = z
  .object({
    assetId: rowId,
    // `G01-D14` — `ATTACHMENT` exists in the schema and is not exposed here.
    role: z.enum(APP5_REQUEST_ASSET_ROLES).meta({
      description: 'COP_IMAGE for the customer-owned garment, REFERENCE for inspiration artwork.',
    }),
  })
  .strict()
  .meta({ id: 'CustomRequestAssetBinding' });

export const submitCustomRequestSchema = z
  .object({
    challengeId: rowId.meta({
      description:
        'A VERIFIED, unexpired SUBMISSION-purpose verification challenge. It authorizes the ' +
        'submission and is also its idempotency scope: re-sending the same body replays the ' +
        'same result instead of creating a second request.',
    }),
    catalog: catalogSubjectSchema.optional(),
    customerOwnedProduct: customerOwnedProductSchema.optional(),
    breakdown: z
      .array(quantityLineSchema)
      .max(50)
      .default([])
      .refine(
        (lines) => new Set(lines.map((line) => line.sizeLabel ?? '')).size === lines.length,
        'Each size may appear only once.',
      )
      .meta({ description: 'Quantity per size. Required on the catalog branch.' }),
    customerNote: z.string().trim().min(1).max(2000).optional(),
    assets: z
      .array(requestAssetSchema)
      .max(20)
      .default([])
      .meta({
        description:
          'Already-accepted customer uploads to bind. At least one COP_IMAGE on the ' +
          'customer-owned branch; at most ten per role.',
      }),
  })
  .strict()
  .meta({
    description:
      'Submits one custom request. Exactly one subject must be present — a catalog product ' +
      'with its design session, or a customer-owned product.',
  });

export type SubmitCustomRequestInput = z.infer<typeof submitCustomRequestSchema>;

export class SubmitCustomRequestBody extends createZodDto(submitCustomRequestSchema) {}

registerZodDtos(SubmitCustomRequestBody);
