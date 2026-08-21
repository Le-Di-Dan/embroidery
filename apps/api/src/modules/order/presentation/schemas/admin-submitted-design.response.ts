/**
 * The published `APP6-B07` response — the submitted design as digitizing source.
 *
 * `document` references the generated `APP3-P01` component graph through the
 * `APP3-B08-C1` marker, exactly as `DesignSessionSnapshotResponse` does. That is
 * the point: there is one structural definition of a Design Document in this
 * repository, it is derived from P01's TypeScript types, and nothing here
 * restates a field of it. A second Admin-flavoured document schema would drift
 * from the customer-facing one the first time an element kind is added.
 *
 * ## What is absent
 *
 * No session secret, digest, pepper or cookie; no storage key, bucket, provider
 * URL or presign; no customer identity, contact or credential; no APP3 auth
 * context; no rendered preview, raster derivative or document hash. `sessionId`
 * is provenance an authenticated operator may see — the same value `APP5-B04`'s
 * detail already publishes as `subject.designSessionId` — and the raw session id
 * is never an authorization input on its own (`design_sessions` header).
 *
 * ## Why `submittedDesign` is nullable rather than optional
 *
 * A customer-owned-product request has no Design Session **by design**, and a
 * pointed session may have been swept. Both are ordinary successful answers, so
 * the field is always present and explicitly `null` — a client reads one
 * discriminator rather than distinguishing "absent" from "not applicable", and
 * the generated client types it `AdminSubmittedDesignSourceResponse | null`
 * instead of making the whole property optional.
 */
import { ApiProperty } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

const SESSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/**
 * The `document` property, carrying the `APP3-B08-C1` publication marker.
 *
 * Declared as a variable rather than inline for the reason
 * `design-session-snapshot.response.ts` records: the marker is a vendor
 * extension, `ApiPropertyOptions` describes only the keys Swagger itself
 * defines, and a fresh object literal would be rejected by excess-property
 * checking even though the decorator passes unknown keys straight through. The
 * `type`/`additionalProperties` pair is a placeholder — document assembly
 * replaces this whole node with a reference to the generated `DesignDocument`
 * component, and the gate fails if it does not.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description: 'The canonical, quantized Design Document exactly as persisted.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

export class AdminSubmittedDesignSourceResponse {
  @ApiProperty({
    format: 'uuid',
    example: SESSION_ID_EXAMPLE,
    description:
      'The exact Design Session the request was submitted from. Provenance, not a credential: ' +
      'no route accepts it and no secret is derivable from it.',
  })
  sessionId!: string;

  @ApiProperty(DOCUMENT_PROPERTY)
  document!: unknown;

  @ApiProperty({
    example: 1,
    description: 'The Design Document schema version this document is governed by.',
  })
  documentSchemaVersion!: number;

  @ApiProperty({
    example: 4,
    description: 'The autosave revision the document was frozen at when the customer submitted.',
  })
  revision!: number;
}

export class AdminSubmittedDesignResponse {
  @ApiProperty({
    type: AdminSubmittedDesignSourceResponse,
    nullable: true,
    description:
      '`null` when the request has no submitted design source — a customer-owned-product ' +
      'request, which has no Design Session by design, or a Catalog request whose session is ' +
      'no longer available. Both are successful reads; neither is reported as an error.',
  })
  submittedDesign!: AdminSubmittedDesignSourceResponse | null;
}

/** The serialized payload, as the controller returns it. */
export interface AdminSubmittedDesignPayload {
  readonly submittedDesign: {
    readonly sessionId: string;
    readonly document: unknown;
    readonly documentSchemaVersion: number;
    readonly revision: number;
  } | null;
}
