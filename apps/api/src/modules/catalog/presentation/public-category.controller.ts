/**
 * The one public category inventory read (`APP12-C01`).
 *
 *   GET /api/public/categories — publicCategory_list
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * contract suite asserts that absence so it cannot be added by accident. The
 * operation takes no session, no cookie and no Origin allowlist.
 *
 * The controller owns HTTP and nothing else. It takes **no parameter at all** —
 * no cursor, no limit, no filter — because this is an inventory, not a browsing
 * feed: a navigation taxonomy rendered from half a response is worse than one
 * that failed, and the store's category count is bounded far inside the
 * one-response cap the query enforces.
 *
 * Its base path is its own. `public/products` is claimed by the catalog and
 * media controllers and `public/categories` by nothing else, so registration
 * order cannot make one route shadow another.
 *
 * ## Read only, and only categories
 *
 * There is exactly one method here and there will be no second one in this
 * checkpoint. Category creation, editing, publication and archival are
 * `APP12-C02`'s Admin surface; this class holds no write repository and its
 * module wires none, which is a composition fact rather than a convention a
 * reviewer has to trust.
 */
import { Controller, Get, Header } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicCategoryQuery } from '../application/public-category.query';
import type { PublicCategoryListView } from '../application/public-category.projection';
import { isPublicCategoryError, toHttpException } from '../domain/public-category.errors';
import { PUBLIC_CATEGORY_CACHE_CONTROL } from '../domain/public-category.policy';
import {
  PublicCategoryInventoryItemResponse,
  PublicCategoryListResponse,
} from './schemas/public-category.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Envelope + `data` for the one documented success payload. */
function envelopeOf(model: Parameters<typeof getSchemaPath>[0]) {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

@ApiTags('publicCategory')
@Controller('public/categories')
export class PublicCategoryController {
  constructor(private readonly categories: PublicCategoryQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CATEGORY_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_CATEGORY_LIST_READ', 'Public categories retrieved.')
  @ApiOperation({
    operationId: 'publicCategory_list',
    summary: 'List the publicly browsable categories',
    description:
      'Returns every category an anonymous caller may browse by, as `{ slug, name, ' +
      'isIndexable, displayOrder }`. Anonymous: no session or cookie is involved. ' +
      'The taxonomy is **dynamic** — it is operator data, not a fixed contract enum — so a ' +
      'consumer reads it here instead of compiling a category list in. ' +
      'A category appears when it is published and not archived. Draft and archived ' +
      'categories are absent, and absence is the only signal: the response never reveals ' +
      'that an unpublished category exists. ' +
      'Indexability is not visibility: a category marked `isIndexable: false` is listed and ' +
      'fully browsable, and must simply not be advertised in a sitemap or an indexable ' +
      'breadcrumb. The flag is carried so that decision needs no second read. ' +
      'Path-agnostic on purpose: no absolute URL and no browser route is emitted, because ' +
      'the Storefront owns route shapes and composes them itself. ' +
      'The inventory is complete and unpaged — there is no cursor, limit or filter, and a ' +
      'taxonomy too large for one response fails rather than truncating. ' +
      'Ordered by `displayOrder` then `slug`, deterministically. ' +
      'Responses are never stored: publication and archival are re-read on every request, ' +
      'and there is no cache-invalidation consumer in this system, so a stored copy could ' +
      'keep offering a withdrawn category.',
  })
  @ApiExtraModels(PublicCategoryListResponse, PublicCategoryInventoryItemResponse)
  @ApiResponse({
    status: 200,
    description: 'The complete publicly browsable taxonomy.',
    schema: envelopeOf(PublicCategoryListResponse),
  })
  @ApiResponse({
    status: 503,
    description: 'The taxonomy exceeds what one response may carry; nothing partial is sent.',
    schema: ERROR_SCHEMA,
  })
  async list(): Promise<PublicCategoryListView> {
    try {
      return await this.categories.list();
    } catch (error: unknown) {
      // Anything else propagates untouched, so an unexpected failure is
      // redacted by the global filter instead of being reshaped here.
      throw isPublicCategoryError(error) ? toHttpException(error) : error;
    }
  }
}
