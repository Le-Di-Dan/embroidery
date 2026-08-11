/**
 * The documented shape of a Session asset's processing status (`APP3-S06` §11).
 *
 * OpenAPI only; the runtime value is the repository's `SessionAssetStatus`. Every
 * field here is a field an anonymous browser is allowed to see, and the list is
 * deliberately short: a state, and — once there is one — exactly the `APP3-P01`
 * image-media identity plus the `APP3-DB01` quartet the Studio needs to build a
 * valid image element.
 *
 * ## Why this operation exists at all
 *
 * `APP3-B06C` collapses every private miss into one indistinguishable 404, which
 * is right for a *delivery* route: distinguishing "not yours" from "not ready"
 * there would turn the address into an enumeration oracle. But it means the Blob
 * endpoint cannot tell the Studio whether an image is still processing, was
 * rejected, or was never theirs — so polling it as a state machine would be
 * reading a refusal as progress. This projection answers that question for an
 * Asset the caller has already proved it owns, and only that question.
 *
 * ## What is deliberately absent
 *
 * No storage key, bucket, provider, endpoint, checksum or presigned URL. No
 * source filename. No inspection detail, rejection reason, worker error, job id,
 * lease or retry count — a customer cannot act on any of them and publishing one
 * would describe the pipeline's internals to an anonymous caller. No session
 * secret or digest, and no revision: reading changes nothing.
 */
import { ApiProperty } from '@nestjs/swagger';

import { SESSION_ASSET_MEDIA_TYPES } from '../../domain/design-session-asset-delivery.policy';

const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const DERIVATIVE_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e09';

/**
 * The three states, and the boundary between them is a terminal verdict.
 *
 * `PROCESSING` covers everything before one: still being inspected, and accepted
 * but not yet normalized. The two are not distinguished on purpose — the Studio
 * shows one "being processed" state for both, and naming the stage would publish
 * the shape of the worker pipeline for no behaviour a caller could take.
 */
export const SESSION_ASSET_STATES = ['PROCESSING', 'READY', 'REJECTED'] as const;

export class DesignSessionAssetStatusResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    enum: SESSION_ASSET_STATES,
    example: 'READY',
    description:
      '`PROCESSING` while the image is being inspected or normalized, `READY` once an ' +
      'editor-safe image exists, `REJECTED` once inspection has refused the file. `READY` is ' +
      'the only state that carries media fields.',
  })
  state!: string;

  @ApiProperty({
    format: 'uuid',
    required: false,
    example: DERIVATIVE_ID_EXAMPLE,
    description:
      'Present only when `READY`. The canonical editor-safe derivative to place in the design ' +
      'document. It is an opaque identity, not a storage reference, and grants no access.',
  })
  derivativeId?: string;

  @ApiProperty({
    required: false,
    example: 1_200,
    description:
      'Present only when `READY`. The measured intrinsic width of the editor-safe image, in ' +
      'pixels. It is the only authority for the placed element’s intrinsic size.',
  })
  widthPx?: number;

  @ApiProperty({
    required: false,
    example: 800,
    description: 'Present only when `READY`. The measured intrinsic height, in pixels.',
  })
  heightPx?: number;

  @ApiProperty({
    required: false,
    enum: SESSION_ASSET_MEDIA_TYPES,
    example: 'image/webp',
    description:
      'Present only when `READY`. The editor-safe media type, which is what the preview ' +
      'endpoint serves — never the uploaded original’s type.',
  })
  mediaType?: string;

  @ApiProperty({
    required: false,
    example: 51_200,
    description: 'Present only when `READY`. The measured size of the editor-safe image.',
  })
  byteSize?: number;
}
