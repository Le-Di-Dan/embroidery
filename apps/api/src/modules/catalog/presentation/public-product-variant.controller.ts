/**
 * The public variant selection read (`APP5-B07`).
 *
 *   GET /api/public/products/:slug/variants — publicProductVariant_list
 *
 * One operation, added to close the `APP5-S01` blocker
 * `CATALOG_VARIANT_PUBLIC_READ_REQUIRED`: the APP5 catalog subject requires a
 * `productVariantId` that no public contract published, so a Storefront could
 * assemble a product and a design session but never a submittable request.
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * contract spec asserts that absence so it cannot be added by accident.
 *
 * The route shares the `public/products` base with the `APP2-B04` catalogue, the
 * `APP2-T01` media controller and the `APP3-B01` placement manifest. It collides
 * with none of them: the catalogue detail has one segment after the base, this
 * and the manifest have two that differ in their literal, and media has four.
 *
 * ### Its own class, not a third method on `PublicProductController`
 *
 * That controller's contract spec asserts it declares **exactly two**
 * operations, which is a real guarantee about the `APP2-B04` surface rather than
 * a formality — and this read belongs to `APP5`, arrives on its own checkpoint
 * and answers a different question. A separate class keeps that assertion
 * meaningful and keeps this operation's own absences assertable on their own
 * source. Both classes still derive their operation ids from their own names, so
 * no `CONTROLLER_DOMAIN_KEYS` entry is needed and no accepted id is reissued.
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
import {
  PublicProductVariantQuery,
  type PublicProductVariantListView,
} from '../application/public-product-variant.query';
import { PUBLIC_CATALOG_CACHE_CONTROL } from '../domain/public-product-catalog.policy';
import {
  isPublicProductCatalogError,
  toHttpException,
} from '../domain/public-product-catalog.errors';
import { PublicProductSlugParam } from './schemas/public-product.request';
import {
  PublicProductVariantListResponse,
  PublicProductVariantResponse,
} from './schemas/public-product-variant.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Envelope + `data` for one documented success payload. */
function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

@ApiTags('publicProductVariant')
@Controller('public/products/:slug/variants')
export class PublicProductVariantController {
  constructor(private readonly variants: PublicProductVariantQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_PRODUCT_VARIANT_LIST_READ', 'Selectable product variants retrieved.')
  @ApiOperation({
    operationId: 'publicProductVariant_list',
    summary: 'List the selectable variants of a published product',
    description:
      'The variants a customer may choose when creating a catalog custom request, with the ' +
      'product id to submit alongside one. Anonymous: no session or cookie is involved, and ' +
      'there is no parameter of any kind — the caller cannot select lifecycle visibility, and ' +
      'delisted variants are excluded by the query itself. Ordered by the product’s own display ' +
      'order then id, so repeated reads agree. An unknown slug, a draft, an archived product ' +
      'and a product without a public category all return the same 404. A published product ' +
      'with no selectable variant returns an empty list rather than a 404: it exists, it simply ' +
      'cannot form a catalog request. Selection only — no SKU, price, stock or inventory is ' +
      'published here, and no variant is marked as a default. Responses are never stored, ' +
      'because publication is re-read on every request and nothing in this system invalidates ' +
      'a cache.',
  })
  @ApiParam({ name: 'slug', description: 'The immutable server-owned product slug.' })
  @ApiExtraModels(PublicProductVariantListResponse, PublicProductVariantResponse)
  @ApiResponse({
    status: 200,
    description: 'The selectable variants of the published product.',
    schema: envelopeOf(PublicProductVariantListResponse),
  })
  @ApiResponse({ status: 400, description: 'The slug is not well formed.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No published product is available at that slug.',
    schema: ERROR_SCHEMA,
  })
  async list(@Param() params: PublicProductSlugParam): Promise<PublicProductVariantListView> {
    try {
      return await this.variants.publicRead(params.slug);
    } catch (error: unknown) {
      // The catalogue's own safe not-found: unknown, draft, archived and
      // non-public category are one answer, so this route cannot be used to
      // enumerate unpublished products. Anything else propagates untouched and
      // is redacted by the global filter rather than reshaped into a 4xx here.
      throw isPublicProductCatalogError(error) ? toHttpException(error) : error;
    }
  }
}
