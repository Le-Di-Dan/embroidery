/**
 * Request-side validation for the three Admin Design Template operations
 * (`APP3-B03`).
 *
 * Every schema is `.strict()`: an unknown field is a client bug worth reporting,
 * and silently dropping one is how a caller believes it set something it did
 * not.
 *
 * Nothing the server owns is accepted: no slug — that is derived from the name
 * and is the public address `APP3-B05` will read by — no status, no
 * `currentVersion`, no `previewDerivativeId` and no `archivedAt`. A request
 * therefore cannot put a row into a state `APP3-B04` would later have to repair.
 *
 * Deliberately **absent**: `designDocument` and `documentSchemaVersion`. Header
 * creation persists no document (`B03_CONTRACT_RULING`), so accepting one would
 * publish a field the server ignores — the worst kind of contract, because the
 * caller believes the document was saved.
 */
import type { DesignTemplateState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The lifecycle values the list filter accepts.
 *
 * Declared here rather than imported as a runtime value: presentation must not
 * pull the ORM schema namespace in (`BACKEND_CONVENTIONS.md` §3). The assertion
 * below is the safety net — if `DesignTemplateState` gains a member, this file
 * stops compiling instead of silently rejecting a valid filter.
 */
export const DESIGN_TEMPLATE_STATUS_FILTERS = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const satisfies readonly DesignTemplateState[];

type MissingStatus = Exclude<DesignTemplateState, (typeof DESIGN_TEMPLATE_STATUS_FILTERS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingStatus = MissingStatus extends never ? true : ['missing', MissingStatus];

/** `design_templates.name` is `text`; the cap is readability policy. */
export const TEMPLATE_NAME_MAX_LENGTH = 120;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 2000;

/** UUID path parameter — rejected before any repository call. */
export const templateIdParamSchema = z.object({ templateId: z.string().uuid() }).strict();

export class DesignTemplateIdParam extends createZodDto(templateIdParamSchema) {}

export const listDesignTemplatesQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(DESIGN_TEMPLATE_STATUS_FILTERS).optional(),
    productId: z.string().uuid().optional(),
  })
  .strict();

export class ListDesignTemplatesQuery extends createZodDto(listDesignTemplatesQuerySchema) {}

/**
 * The create body.
 *
 * The scope triple is optional **as a triple**, never field by field:
 * `IMP-D042` PO-06 lets a draft be authored with an incomplete scope, but a Side
 * without its Product is not incomplete — it is wrong, and `APP3-B04` would have
 * to repair it before publishing. The refinement rejects a partial triple here,
 * before the request reaches a repository; the application authority then proves
 * the triple actually resolves and is active.
 */
export const createDesignTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX_LENGTH),
    description: z.string().max(TEMPLATE_DESCRIPTION_MAX_LENGTH).optional(),
    productId: z.string().uuid().optional(),
    productSideId: z.string().uuid().optional(),
    embroideryAreaId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (body) => {
      const supplied = [body.productId, body.productSideId, body.embroideryAreaId].filter(
        (value) => value !== undefined,
      ).length;
      return supplied === 0 || supplied === 3;
    },
    {
      message:
        'A design template scope needs the product, the side and the area together, or none of them.',
    },
  );

export class CreateDesignTemplateBody extends createZodDto(createDesignTemplateBodySchema) {}

registerZodDtos(DesignTemplateIdParam, ListDesignTemplatesQuery, CreateDesignTemplateBody);
