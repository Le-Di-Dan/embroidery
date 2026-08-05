/**
 * The public placement manifest (`APP3-B01`; IMP-D041 PO-02).
 *
 *   GET /api/public/products/:slug/placement — publicProductPlacement_get
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * contract test asserts that absence so it cannot be added by accident.
 *
 * The route shares the `public/products` base with the `APP2-B04` catalogue and
 * the `APP2-T01` media controller; it cannot collide with either, because it has
 * two segments after the base where the catalogue detail has one and the media
 * route has four.
 *
 * This operation **does not** serve bytes. `APP3-B02` owns side-background
 * delivery, so the manifest carries the reference components that route will be
 * keyed by and no address of any kind.
 */
import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { ProductPlacementQuery } from '../application/product-placement.query';
import type { PublicPlacementView } from '../application/product-placement.projection';
import { PUBLIC_PLACEMENT_CACHE_CONTROL } from '../domain/product-placement.policy';
import {
  isPublicProductCatalogError,
  toHttpException,
} from '../domain/public-product-catalog.errors';
import { ProductSlugParam } from './schemas/admin-product-placement.request';
import {
  PublicPlacementAreaResponse,
  PublicPlacementBackgroundDeliveryResponse,
  PublicPlacementBackgroundResponse,
  PublicPlacementSideResponse,
  PublicProductPlacementResponse,
} from './schemas/product-placement.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

@ApiTags('publicProductPlacement')
@Controller('public/products/:slug/placement')
export class PublicProductPlacementController {
  constructor(private readonly query: ProductPlacementQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_PLACEMENT_CACHE_CONTROL)
  @ApiSuccessCode('PRODUCT_PLACEMENT_MANIFEST_READ', 'Placement manifest retrieved.')
  @ApiOperation({
    summary: 'Get the public placement manifest',
    description:
      'The read-only placement a Studio session starts from: active Product Sides and Embroidery ' +
      'Areas of a publicly visible Product, ordered by displayOrder, code and id. Retired rows are ' +
      'absent, and so is every private fact — no background Asset id, storage key, original or ' +
      'derivative URL, inspection detail or mutation field. `studioEligible` is true only when one ' +
      'active side has at least one active area and an approved editor-safe background; incomplete ' +
      'or unprocessed placement reports false rather than inventing geometry. A Product with no ' +
      'placement is still published and still returns a manifest, with an empty side list.',
  })
  @ApiParam({ name: 'slug', description: 'The public Product address.' })
  @ApiExtraModels(
    PublicProductPlacementResponse,
    PublicPlacementSideResponse,
    PublicPlacementAreaResponse,
    PublicPlacementBackgroundResponse,
    PublicPlacementBackgroundDeliveryResponse,
  )
  @ApiResponse({
    status: 200,
    description: 'The placement manifest.',
    schema: envelopeOf(PublicProductPlacementResponse),
  })
  @ApiResponse({
    status: 404,
    description: 'No publicly visible product at that address.',
    schema: ERROR_SCHEMA,
  })
  async get(@Param() params: ProductSlugParam): Promise<PublicPlacementView> {
    try {
      return await this.query.publicRead(params.slug);
    } catch (error: unknown) {
      // Reuses the catalogue's own safe not-found behaviour: an unknown slug, a
      // draft, an archived product and one in a non-public category are all the
      // same 404, so an anonymous caller cannot enumerate what is unpublished.
      throw isPublicProductCatalogError(error) ? toHttpException(error) : error;
    }
  }
}
