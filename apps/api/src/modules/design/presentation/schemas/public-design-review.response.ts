/**
 * What the customer's secure design review read returns (`APP6-B10` §8).
 *
 * `document` references the generated `APP3-P01` component graph through the
 * `APP3-B08-C1` marker, exactly as `DesignSessionSnapshotResponse` does. That is
 * the point: there is exactly one structural definition of a Design Document in
 * this repository, it is derived from P01's TypeScript types, and nothing here
 * restates a field of it. Catalog `v1` and COP `v2` documents are the same
 * published component — the schema version travels as its own integer field and
 * neither document is migrated or rewritten on the way out.
 *
 * ### What is absent
 *
 * No storage key, bucket, provider URL, derivative id, preview hash or asset id;
 * no private original and no rendered raster — `APP6-S02` renders the safe
 * document through the APP3 native-SVG renderer under the APP3-S09 runtime
 * watermark, and no byte route exists on this surface. No customer id, contact,
 * secure link, grant id, token, digest or step-up challenge. No design case id,
 * no `parentVersionId`, no superseded ids and no review history. No placement,
 * product, variant, side or area id: the geometry is already frozen inside the
 * document the renderer receives. No Approval Snapshot and no acceptance record
 * — those are `APP6-B11`'s.
 */
import { ApiProperty } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const AGREEMENT_VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const HASH_EXAMPLE = 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

/**
 * The `document` property, carrying the `APP3-B08-C1` publication marker.
 *
 * Declared as a variable rather than inline because the marker is a vendor
 * extension and `ApiPropertyOptions` describes only the keys Swagger itself
 * defines; a fresh object literal would be rejected by excess-property checking
 * even though the decorator passes unknown keys straight through into the
 * schema. The `type`/`additionalProperties` pair is a placeholder — document
 * assembly replaces this whole node with a reference to the generated
 * `DesignDocument` component, and the contract suite fails if it does not.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description:
    'The exact Design Document persisted on the version under review, as stored. Never ' +
    'migrated, re-quantized or rewritten on read: this is the byte content `documentHash` ' +
    'was computed over at send.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

/** One required term, as shown and as `APP6-B11` will be asked to submit it back. */
export class DesignReviewAgreementResponse {
  @ApiProperty({ format: 'uuid', example: AGREEMENT_VERSION_ID_EXAMPLE })
  agreementVersionId!: string;

  @ApiProperty({
    example: 'PAYMENT_POLICY',
    description:
      'The agreement type. The set and its order come from the published ' +
      '`design_approval.agreements` policy, so this is configuration rather than a fixed ' +
      'enumeration and a client must not hard-code the members.',
  })
  agreementType!: string;

  @ApiProperty({
    example: 1,
    description: 'Monotonic within the agreement. Display and support reference only.',
  })
  version!: number;

  @ApiProperty({
    example: HASH_EXAMPLE,
    description:
      'SHA-256 over the exact content below, stored at publication. `APP6-B11` submits this ' +
      'value back and `GRD-008` refuses any approval whose hashes no longer match.',
  })
  contentHash!: string;

  @ApiProperty({
    example: 'vi',
    description: 'BCP-47 tag of the content. MVP is single-language Vietnamese.',
  })
  language!: string;

  @ApiProperty({
    description:
      'The customer-visible text of this exact version, as published. Plain text; paragraphs ' +
      'are separated by a blank line.',
  })
  content!: string;
}

export class CustomerDesignReviewResponse {
  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  designVersionId!: string;

  @ApiProperty({ example: 2, description: 'Monotonic within the design case.' })
  version!: number;

  @ApiProperty({
    example: 1,
    description:
      'The schema version the stored document is governed by. `1` for a Catalog design and ' +
      '`2` for a customer-owned-product one; both are the same published `DesignDocument` ' +
      'component and neither is converted to the other.',
  })
  documentSchemaVersion!: number;

  @ApiProperty({
    example: HASH_EXAMPLE,
    description:
      'The hash stored on the version when it was sent — SHA-256 over the canonical (JCS) ' +
      'bytes of the document below. It is read from the row, never recomputed on this read, ' +
      'and it is the exact value `APP6-B11` submits back for `GRD-007`.',
  })
  documentHash!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the workshop sent this version for review.',
  })
  sentAt!: string;

  @ApiProperty(DOCUMENT_PROPERTY)
  document!: unknown;

  @ApiProperty({
    type: [DesignReviewAgreementResponse],
    description:
      'The complete effective agreement set an approval will bind, in the published ' +
      'required-type order. Every required type appears exactly once; a set that could not be ' +
      'resolved completely is a 503 rather than a shortened list.',
  })
  agreements!: DesignReviewAgreementResponse[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'When the secure link itself stops working. Reading never extends it and never consumes ' +
      'the link.',
  })
  accessExpiresAt!: string;
}

/**
 * The serialised shape the handler returns.
 *
 * A structural mirror of {@link CustomerDesignReviewResponse} rather than the
 * class itself, matching `CustomerQuotationHttpView`: the class is the published
 * *schema* and carries `!` definite-assignment fields no plain object satisfies,
 * while this is what the projection actually builds. Keeping them separate is
 * what lets the projection be written field by field and type-checked.
 */
export interface DesignReviewAgreementHttpView {
  readonly agreementVersionId: string;
  readonly agreementType: string;
  readonly version: number;
  readonly contentHash: string;
  readonly language: string;
  readonly content: string;
}

export interface CustomerDesignReviewHttpView {
  readonly designVersionId: string;
  readonly version: number;
  readonly documentSchemaVersion: number;
  readonly documentHash: string;
  readonly sentAt: string;
  readonly document: unknown;
  readonly agreements: readonly DesignReviewAgreementHttpView[];
  readonly accessExpiresAt: string;
}
