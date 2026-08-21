/**
 * Request-side validation for the two Admin design-version operations
 * (`APP6-B08` §13).
 *
 * The body is `.strict()`, and that is the security property rather than a style
 * choice. Every one of these is server-owned and **absent from the contract**:
 *
 * ```text
 * requestId           designCaseId        customerId
 * customerOwnedProductId                  productId
 * productVariantId    productSideId       embroideryAreaId
 * adminId             actorKind           status
 * version             parentVersionId     documentHash
 * previewHash         previewDerivativeId createdAt
 * ```
 *
 * A schema that merely *ignored* them would accept a body claiming to set one,
 * and an operator would reasonably believe it had. Sent, any of them is a `400`
 * naming the unrecognised key.
 *
 * The four Catalog identities deserve their own note. They are not omitted
 * because they are inconvenient: they are the server's derivation from the
 * request and its submitted Design Session, and a version whose placement a
 * caller could name is a version that could be frozen onto somebody else's
 * product. `parentVersionId` is absent for the same reason — lineage is read
 * from the design case, so a caller cannot point a new version at another case's
 * history.
 *
 * ## Why the COP fields are here at all
 *
 * `placementSideLabel`, `placementAreaLabel`, `physicalWidthMm` and
 * `physicalHeightMm` are the only placement facts a caller supplies, and only on
 * the customer-owned branch — because that branch has no Catalog authority to
 * derive them from (`ADR-APP6-001` §3.3/§3.7). They are optional *in the schema*
 * and conditionally required *in the use case*, which is where the branch is
 * known: the branch is derived from persisted request state, so a schema that
 * tried to require them would have to be told which branch it was on by the
 * caller — reintroducing the client-selected branch the ADR forbids.
 *
 * Sending them on a Catalog request is a refusal, not a silent ignore.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

/** UUID path parameter — rejected before any repository call. */
export const designVersionRequestParamSchema = z.object({ requestId: z.string().uuid() }).strict();

export class DesignVersionRequestParam extends createZodDto(designVersionRequestParamSchema) {}

/**
 * One agreed placement label, as text the customer and operator settled on.
 *
 * Trimmed then bounded. `min(1)` **after** the trim is what makes CST-130's
 * nonblank rule reachable from here: a whitespace-only label would otherwise
 * satisfy a length check and then be rejected by the database as a sanitised
 * 500, telling the operator nothing. 120 characters is the `approval_snapshots`
 * `side_name`/`area_name` these are eventually copied into.
 */
const placementLabelSchema = z.string().trim().min(1).max(120);

/**
 * A positive millimetre dimension of the embroidery placement envelope.
 *
 * A **number**, unlike `APP6-B01`'s money strings, and for the opposite reason:
 * `physical_width_mm` is `numeric` without a fixed scale and the design document
 * carries its geometry as JSON numbers, so the envelope and the document it
 * bounds are compared as numbers by the design engine's quantized comparison.
 * Parsing to a decimal string here and back would introduce a second precision
 * rule beside P01's quantization, which `IMP-D044` PO-09 forbids.
 *
 * The upper bound is a sanity ceiling, not a business rule: ten metres is larger
 * than any garment, and an unbounded value would let a document declare an
 * envelope that no containment check could meaningfully fail.
 */
const envelopeMmSchema = z.number().finite().positive().max(10_000);

export const authorDesignVersionBodySchema = z
  .object({
    /**
     * The Design Document, validated by `APP3-P01`/`P02` rather than by Zod.
     *
     * `unknown` on purpose: restating the document's shape here would be a
     * second definition of it beside the package that owns it, and the two would
     * drift the first time an element kind is added. The schema's job is to prove
     * the *body* is well formed; P01 is the document's acceptance authority and
     * it runs inside the write transaction.
     */
    document: z.record(z.string(), z.unknown()).meta({
      description:
        'The complete Design Document for this formal version. Validated, quantized and ' +
        'canonicalized by the design-document authority; the stored value is the prepared ' +
        'form, not the object as sent. A catalog version carries schema version 1 with both ' +
        'placement ids present; a customer-owned version carries schema version 2 with both ' +
        'explicitly null.',
      // `APP3-B08-C1`, the same marker the autosave body uses and for the same
      // reason: the Zod schema stays permissive because `APP3-P01` is the
      // acceptance authority and a Zod copy of the document would be a second
      // definition that drifts, while this marker still publishes the real
      // structure as a `$ref` to the schema generated from P01's own types.
      [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
    }),
    placementSideLabel: placementLabelSchema.optional(),
    placementAreaLabel: placementLabelSchema.optional(),
    physicalWidthMm: envelopeMmSchema.optional(),
    physicalHeightMm: envelopeMmSchema.optional(),
  })
  .strict();

export class AuthorDesignVersionBody extends createZodDto(authorDesignVersionBodySchema) {}

registerZodDtos(DesignVersionRequestParam, AuthorDesignVersionBody);
