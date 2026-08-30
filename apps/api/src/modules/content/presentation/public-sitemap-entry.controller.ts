/**
 * The one public SEO inventory read (`APP11-B04`).
 *
 *   GET /api/public/sitemap-entries — publicSitemapEntry_list
 *
 * Anonymous by construction. Guards are opt-in per controller in this codebase,
 * so "public" is the absence of a decorator rather than a setting, and the
 * contract suite asserts that absence so it cannot be added by accident. The
 * operation takes no session, no cookie and no Origin allowlist.
 *
 * The controller owns HTTP and nothing else. It takes **no parameter at all** —
 * no cursor, no limit, no offset, no filter — because this is an inventory, not
 * a browsing feed: a consumer that had to page a sitemap could observe a
 * half-published index between pages, and the store's catalogue is bounded well
 * inside the one-response cap the query enforces.
 *
 * Its base path is claimed by no other module, so registration order cannot
 * make one route shadow another.
 */
import { Controller, Get, Header } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { PublicSitemapQuery } from '../application/public-sitemap.query';
import type { PublicSitemapView } from '../application/public-sitemap.projection';
import { isPublicSitemapError, toHttpException } from '../domain/public-sitemap.errors';
import { PUBLIC_SITEMAP_CACHE_CONTROL } from '../domain/public-sitemap.policy';
import {
  PublicSitemapEntryResponse,
  PublicSitemapListResponse,
} from './schemas/public-sitemap.response';

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

@ApiTags('publicSitemapEntry')
@Controller('public/sitemap-entries')
export class PublicSitemapEntryController {
  constructor(private readonly sitemap: PublicSitemapQuery) {}

  @Get()
  @Header('Cache-Control', PUBLIC_SITEMAP_CACHE_CONTROL)
  @ApiSuccessCode('PUBLIC_SITEMAP_ENTRY_LIST_READ', 'Indexable URL inventory retrieved.')
  @ApiOperation({
    operationId: 'publicSitemapEntry_list',
    summary: 'List the indexable dynamic URL inventory',
    description:
      'Returns every dynamic entity a search engine may index right now, as `{ kind, slug, ' +
      'updatedAt }`. Anonymous: no session or cookie is involved. ' +
      'A Product appears only when it is publicly visible under the catalog publication ' +
      'authority **and** marked indexable; a gallery entry only when it is published, ' +
      'marked indexable, and its detail page would currently render — so no advertised ' +
      'slug resolves to a 404. ' +
      'Indexability is not visibility: a `noindex` entity stays publicly readable at its ' +
      'own address and is simply absent here. Absence is the only signal — the response ' +
      'never reveals that a hidden, draft or `noindex` entity exists. ' +
      'Path-agnostic on purpose: no absolute URL, no canonical URL and no browser route ' +
      'is emitted, because the Storefront owns route shapes and composes them itself. ' +
      'Static pages and policy pages are Storefront route authority and are not listed. ' +
      'The inventory is complete and unpaged — there is no cursor, limit or filter, and an ' +
      'inventory too large for one response fails rather than truncating, because a ' +
      'crawler cannot tell a partial sitemap from a complete one. ' +
      'Ordered by kind then slug, deterministically; the order carries no SEO weight. ' +
      'Responses are never stored: publication and indexability are re-read on every ' +
      'request, and there is no cache-invalidation consumer in this system, so a stored ' +
      'copy could keep advertising a withdrawn URL.',
  })
  @ApiExtraModels(PublicSitemapListResponse, PublicSitemapEntryResponse)
  @ApiResponse({
    status: 200,
    description: 'The complete indexable URL inventory.',
    schema: envelopeOf(PublicSitemapListResponse),
  })
  @ApiResponse({
    status: 503,
    description: 'The inventory exceeds what one response may carry; nothing partial is sent.',
    schema: ERROR_SCHEMA,
  })
  async list(): Promise<PublicSitemapView> {
    try {
      return await this.sitemap.list();
    } catch (error: unknown) {
      // Anything else propagates untouched, so an unexpected failure is
      // redacted by the global filter instead of being reshaped here.
      throw isPublicSitemapError(error) ? toHttpException(error) : error;
    }
  }
}
