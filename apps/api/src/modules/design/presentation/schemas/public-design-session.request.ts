/**
 * Request contracts for the two anonymous Session operations (`APP3-B07`).
 *
 * The scope is named by its **public** identifiers — a Product slug and the
 * stable `code` of a Side and an Area — never by internal row ids. Those codes
 * are what `/api/public/products/{slug}/placement` already publishes, so a
 * Studio that has rendered the placement manifest can bootstrap from exactly
 * what it already holds, and a caller cannot address a row it was never shown.
 *
 * The body is a discriminated union so the Template slug is *structurally*
 * impossible on a blank bootstrap and *required* on a clone. An optional field
 * plus a runtime check would admit `{ mode: 'BLANK', templateSlug: 'x' }` and
 * then have to decide what it meant.
 *
 * Everything the server owns is absent by construction and rejected by
 * `.strict()`: no session id, secret, status, expiry, revision, document,
 * schema version, private Version id, storage field or customer identity.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** Public slug/code grammar: lowercase, digit and hyphen, bounded. */
const publicCode = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase slug.');

const scopeShape = {
  productSlug: publicCode.meta({
    description: 'Public Product slug, as published by the placement manifest.',
    example: 'ao-thun-co-tron',
  }),
  sideCode: publicCode.meta({
    description: 'Stable Product Side code within that Product.',
    example: 'front',
  }),
  areaCode: publicCode.meta({
    description: 'Stable Embroidery Area code within that Side.',
    example: 'chest',
  }),
};

/** `BLANK` — an empty canonical document for the resolved placement. */
const blankSchema = z
  .object({ mode: z.literal('BLANK'), ...scopeShape })
  .strict()
  .meta({ id: 'CreateBlankDesignSessionBody' });

/** `CLONE_TEMPLATE` — a deep copy of one published Template version. */
const cloneSchema = z
  .object({
    mode: z.literal('CLONE_TEMPLATE'),
    ...scopeShape,
    templateSlug: publicCode.meta({
      description: 'Public slug of a published Design Template scoped to this exact placement.',
      example: 'hoa-sen-co-dien',
    }),
  })
  .strict()
  .meta({ id: 'CloneDesignSessionBody' });

export const createDesignSessionSchema = z
  .discriminatedUnion('mode', [blankSchema, cloneSchema])
  .meta({
    description:
      'Opens one anonymous Design Session on an exact public placement, either empty or ' +
      'cloned from a published Template.',
  });

/** The validated body, narrowed to its branch. Inferred from the one schema. */
export type CreateDesignSessionInput = z.infer<typeof createDesignSessionSchema>;

/**
 * The Nest boundary for a discriminated-union body (`B07_LOCAL_ZOD_UNION_DTO_BRIDGE`).
 *
 * Two constraints collide. Nest reads the parameter's class out of
 * `design:paramtypes`, so `@Body()` must be annotated with a *concrete class* or
 * the global `ZodValidationPipe` finds no metatype and silently stops
 * validating. TypeScript, meanwhile, refuses `extends` on a constructor whose
 * instance type is a union — TS2509, "not an object type or intersection of
 * object types with statically known members".
 *
 * So the constructor *type* is widened just enough to be extensible. This is
 * type-only and isolated to this declaration: the runtime value is the very same
 * class `createZodDto` returned, so the static `zodSchema` still travels with it,
 * the pipe still parses against the union, and P03 still publishes from it. No
 * request datum is ever cast — the controller narrows by re-parsing with the
 * same schema, which is why widening here costs no type safety downstream.
 *
 * The platform adapter is deliberately not changed: teaching `createZodDto` to
 * carry a union instance type is a `platform/validation` concern, not this
 * checkpoint's.
 */
const createDesignSessionDtoBase = createZodDto(createDesignSessionSchema) as unknown as {
  new (): Record<string, unknown>;
  readonly zodSchema: typeof createDesignSessionSchema;
};

export class CreateDesignSessionBody extends createDesignSessionDtoBase {}

/** The public Session id in the path. UUID-shaped, matching the cookie grammar. */
export const designSessionIdParamSchema = z
  .object({
    sessionId: z.string().uuid().meta({
      description: 'Public Design Session identifier.',
      example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
    }),
  })
  .strict();

export class DesignSessionIdParam extends createZodDto(designSessionIdParamSchema) {}

registerZodDtos(CreateDesignSessionBody, DesignSessionIdParam);
