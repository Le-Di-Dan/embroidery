/**
 * The documented response shapes for the three placement operations
 * (`APP3-B01`; IMP-D041 PO-02).
 *
 * These classes exist for OpenAPI, so every field here is a field the named
 * audience is allowed to see — and the split between the Admin and public
 * classes **is** the security contract. The public side classes carry no
 * `backgroundAssetId`, no `retiredAt`, no `supersededById` and no mutation
 * field, and there is no storage key, bucket, checksum, original URL,
 * derivative address or inspection detail anywhere in this file.
 *
 * The runtime projection lives in `product-placement.projection.ts`. Keeping the
 * two apart means adding a property to one and forgetting the other shows up as
 * a type error rather than as a silently undocumented — or silently exposed —
 * field.
 */
import { ApiProperty } from '@nestjs/swagger';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const SIDE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const AREA_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

class PlacementAreaGeometry {
  @ApiProperty({ format: 'uuid', example: AREA_ID_EXAMPLE })
  id!: string;

  @ApiProperty({ description: 'Stable machine identity within the side.', example: 'chest' })
  code!: string;

  @ApiProperty({ description: 'Display copy; never identity.', example: 'Ngực trái' })
  name!: string;

  @ApiProperty({ example: 0 })
  displayOrder!: number;

  @ApiProperty({ description: 'Canvas-space origin, in side image pixels.', example: 120 })
  boundXPx!: number;

  @ApiProperty({ example: 90 })
  boundYPx!: number;

  @ApiProperty({ example: 400 })
  boundWidthPx!: number;

  @ApiProperty({ example: 300 })
  boundHeightPx!: number;

  @ApiProperty({
    nullable: true,
    description: 'Physical maximum in millimetres, or null when the side itself is the only limit.',
    example: 80,
  })
  maxWidthMm!: number | null;

  @ApiProperty({ nullable: true, example: 60 })
  maxHeightMm!: number | null;
}

export class AdminPlacementAreaResponse extends PlacementAreaGeometry {
  @ApiProperty({
    nullable: true,
    format: 'date-time',
    description: 'Set once the area is withdrawn from new selection. Never a deletion.',
    example: null,
  })
  retiredAt!: string | null;

  @ApiProperty({
    nullable: true,
    format: 'uuid',
    description: 'The area of the same side that replaced this one.',
    example: null,
  })
  supersededById!: string | null;
}

class PlacementSideGeometry {
  @ApiProperty({ format: 'uuid', example: SIDE_ID_EXAMPLE })
  id!: string;

  @ApiProperty({ description: 'Stable machine identity within the product.', example: 'front' })
  code!: string;

  @ApiProperty({ example: 'Mặt trước' })
  name!: string;

  @ApiProperty({ example: 0 })
  displayOrder!: number;

  @ApiProperty({ description: 'Background canvas width in pixels.', example: 1000 })
  imageWidthPx!: number;

  @ApiProperty({ example: 1000 })
  imageHeightPx!: number;

  @ApiProperty({ description: 'Physical width the canvas represents.', example: 200 })
  physicalWidthMm!: number;

  @ApiProperty({ example: 200 })
  physicalHeightMm!: number;

  @ApiProperty({
    description: 'The sole canvas↔physical conversion authority for this side.',
    example: 5,
  })
  pxPerMm!: number;
}

export class AdminPlacementSideResponse extends PlacementSideGeometry {
  @ApiProperty({
    format: 'uuid',
    description: 'The Asset whose approved derivative renders this side. Admin-only.',
    example: ASSET_ID_EXAMPLE,
  })
  backgroundAssetId!: string;

  @ApiProperty({ nullable: true, format: 'date-time', example: null })
  retiredAt!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid', example: null })
  supersededById!: string | null;

  @ApiProperty({ type: [AdminPlacementAreaResponse] })
  areas!: AdminPlacementAreaResponse[];
}

export class AdminProductPlacementResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ example: 'DRAFT' })
  productStatus!: string;

  /**
   * The Product optimistic-concurrency token (`APP3-B01-C1`).
   *
   * Worded exactly as `AdminProductDetailResponse.updatedAt` is, because it is
   * the same token from the same column: `products.updated_at`. Both the read
   * and a successful replace return it, so a client always holds the value its
   * next write must echo — and a replace that consumed `T1` answers with `T2`,
   * which is what makes a second write with `T1` provably stale rather than
   * merely unlucky.
   */
  @ApiProperty({
    format: 'date-time',
    description: 'Optimistic-concurrency token; send it back as `expectedUpdatedAt`.',
    example: '2026-08-04T10:00:00.000Z',
  })
  updatedAt!: string;

  @ApiProperty({
    type: [AdminPlacementSideResponse],
    description: 'Active and retired sides alike, ordered by displayOrder, code, id.',
  })
  sides!: AdminPlacementSideResponse[];
}

/**
 * How `APP3-B02` will be asked for this side's background.
 *
 * Reference components, never a URL: B02 owns the delivery route and has not
 * been built, so composing an address here would publish one that does not
 * resolve. Neither component is private — the slug is the public Product address
 * and the code is the side's stable public identity.
 */
/**
 * The deliverable background: where to fetch it and what it intrinsically is.
 *
 * Present only when the Side's background really is deliverable, so a client can
 * treat its presence as the eligibility answer without a second call.
 */
export class PublicPlacementBackgroundDeliveryResponse {
  @ApiProperty({
    example: '/api/public/products/ao-thun-theu-hoa/sides/front/background',
    description:
      'Relative application path to the editor-safe background bytes. It is an application ' +
      'address, never a storage address, and never an Asset or derivative identity. It grants ' +
      'nothing on its own: publication, category visibility, side activity, the background ' +
      'association and the derivative are re-proved on every request.',
  })
  path!: string;

  @ApiProperty({
    example: 2048,
    description:
      "The background image's intrinsic pixel width. Not the Side's authored placement canvas " +
      '`imageWidthPx`, which is separate placement geometry.',
  })
  widthPx!: number;

  @ApiProperty({ example: 1536, description: "The background image's intrinsic pixel height." })
  heightPx!: number;

  @ApiProperty({ example: 'image/webp', description: 'The editor-safe derivative media type.' })
  mediaType!: string;

  @ApiProperty({ example: 184320, description: 'Exact byte size of the object served at `path`.' })
  byteSize!: number;
}

export class PublicPlacementBackgroundResponse {
  @ApiProperty({ example: 'ao-thun-theu-hoa' })
  productSlug!: string;

  @ApiProperty({ example: 'front' })
  sideCode!: string;

  @ApiProperty({
    type: PublicPlacementBackgroundDeliveryResponse,
    nullable: true,
    description:
      'Null when this side has no deliverable editor-safe background — unprocessed, unready, ' +
      'watermarked, incompletely described or withdrawn. Never partially populated: a path and ' +
      'the metadata travel together or not at all, so no fabricated geometry is ever returned.',
  })
  delivery!: PublicPlacementBackgroundDeliveryResponse | null;
}

export class PublicPlacementAreaResponse extends PlacementAreaGeometry {}

export class PublicPlacementSideResponse extends PlacementSideGeometry {
  @ApiProperty({ type: PublicPlacementBackgroundResponse })
  background!: PublicPlacementBackgroundResponse;

  @ApiProperty({ type: [PublicPlacementAreaResponse] })
  areas!: PublicPlacementAreaResponse[];
}

export class PublicProductPlacementResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ example: 'ao-thun-theu-hoa' })
  slug!: string;

  @ApiProperty({
    description:
      'True only when one active side has at least one active area and an approved editor-safe ' +
      'background. Incomplete or unprocessed placement reports false; geometry is never invented.',
    example: false,
  })
  studioEligible!: boolean;

  @ApiProperty({
    type: [PublicPlacementSideResponse],
    description: 'Active sides only, ordered by displayOrder, code, id.',
  })
  sides!: PublicPlacementSideResponse[];
}
