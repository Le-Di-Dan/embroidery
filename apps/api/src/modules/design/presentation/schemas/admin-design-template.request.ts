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
import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

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

/**
 * The initial scope assignment body (`APP3-B03B`).
 *
 * All three ids are **required**, unlike the create body where the triple is
 * optional as a triple. An assignment that could omit a field would be an
 * assignment that could produce a partial scope, which `IMP-D042` PO-06 calls
 * wrong rather than incomplete — and this operation exists precisely to move a
 * Template from *no* scope to a *complete* one.
 *
 * There is no `expectedCurrentVersion`. Every other guarded write in this
 * surface carries one because its legal source state is a range; this one's is a
 * single point — `DRAFT`, counter `0`, all three columns null, no versions — so
 * a caller-supplied token could only ever hold the value the server already
 * requires. A field whose only legal value is `0` is a field that can only be
 * wrong, and the compare-and-set pins all four conditions regardless of what a
 * caller believes.
 *
 * Nothing server-owned is accepted: no status, no `currentVersion`, no version,
 * no document, no slug, name, description, `publishedAt` or asset id.
 */
export const assignDesignTemplateScopeBodySchema = z
  .object({
    productId: z.string().uuid(),
    productSideId: z.string().uuid(),
    embroideryAreaId: z.string().uuid(),
  })
  .strict();

export class AssignDesignTemplateScopeBody extends createZodDto(
  assignDesignTemplateScopeBodySchema,
) {}

/**
 * The draft save body (`APP3-B03A`).
 *
 * A **full snapshot** with an optimistic-concurrency token, and nothing else. No
 * JSON Patch and no partial element mutation: a version is immutable from
 * creation, so a patch would have to be applied against a version the server
 * would then have to reconstruct, and two clients patching the same base would
 * silently merge rather than conflict.
 *
 * `expectedCurrentVersion` is the header counter the caller believes it is
 * advancing from, and **`0` is the ordinary first save** — `APP3-B03` creates a
 * header with no version at all. The server derives the next number from it; the
 * caller never chooses which version it is writing, because a caller that could
 * would be able to overwrite an immutable one.
 *
 * `document` is published through the generated `APP3-P01` component graph, not
 * restated here. Zod validates that a document is *present*; `APP3-P01` is the
 * sole authority on whether it is a valid one, and duplicating any part of that
 * shape would create a second definition that drifts.
 *
 * Deliberately absent: `templateId` (it is the path), `status`, `version`,
 * `publishedAt`, `documentSchemaVersion` (read from the document itself),
 * association ids and event ids — every one of them server-owned.
 */
export const saveDesignTemplateDocumentBodySchema = z
  .object({
    expectedCurrentVersion: z.number().int().min(0),
    document: z
      .unknown()
      .refine((value) => typeof value === 'object' && value !== null, {
        message: 'A design document is required.',
      })
      // The published shape comes from the generated `APP3-P01` component graph:
      // document assembly replaces this node with a reference to it, and the gate
      // fails if it does not. Zod's job here is only that a document is present.
      .meta({
        [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
        description: 'The full Design Document snapshot to save as the next immutable version.',
      }),
  })
  .strict();

export class SaveDesignTemplateDocumentBody extends createZodDto(
  saveDesignTemplateDocumentBodySchema,
) {}

/**
 * The lifecycle bodies (`APP3-B04`).
 *
 * `expectedCurrentVersion` is the `IMP-D042` PO-03 concurrency token, and it is
 * the same counter `APP3-B03A` advances rather than a second one: the current
 * immutable version *is* the publication subject, so a caller holding a stale
 * view of it is exactly the caller who must not transition. Mandatory on all
 * three — a transition without one is the unguarded read-then-write that lets
 * two Admins publish and archive the same template at once.
 *
 * Nothing else is accepted. Not the target status, which the route already says;
 * not `publishedAt`, which the server stamps once; not a version to publish,
 * which is always the current one.
 */
export const lifecycleTemplateBodySchema = z
  .object({ expectedCurrentVersion: z.number().int().min(0) })
  .strict();

export class PublishDesignTemplateBody extends createZodDto(lifecycleTemplateBodySchema) {}
export class UnpublishDesignTemplateBody extends createZodDto(lifecycleTemplateBodySchema) {}

/** `design_templates` stores no reason; the cap keeps an audit summary bounded. */
export const TEMPLATE_ARCHIVE_REASON_MAX_LENGTH = 500;

/**
 * Archive additionally requires a reason.
 *
 * `IMP-D042` PO-03 requires one for archive and restore and for neither publish
 * nor unpublish, so it lives on this body alone. It is trimmed and non-empty:
 * a blank reason satisfies the letter of a required field and none of its
 * purpose.
 */
export const archiveDesignTemplateBodySchema = z
  .object({
    expectedCurrentVersion: z.number().int().min(0),
    reason: z.string().trim().min(1).max(TEMPLATE_ARCHIVE_REASON_MAX_LENGTH),
  })
  .strict();

export class ArchiveDesignTemplateBody extends createZodDto(archiveDesignTemplateBodySchema) {}

registerZodDtos(
  DesignTemplateIdParam,
  ListDesignTemplatesQuery,
  CreateDesignTemplateBody,
  AssignDesignTemplateScopeBody,
  SaveDesignTemplateDocumentBody,
  PublishDesignTemplateBody,
  UnpublishDesignTemplateBody,
  ArchiveDesignTemplateBody,
);
