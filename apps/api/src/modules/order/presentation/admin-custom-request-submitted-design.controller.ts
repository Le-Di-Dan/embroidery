/**
 * The one Admin submitted-design read (`APP6-B07`).
 *
 * ```text
 * GET /api/admin/custom-requests/{requestId}/submitted-design
 *     — adminCustomRequestSubmittedDesign_get
 * ```
 *
 * One operation, and it stays one. This is **not** a generic Admin Design
 * Session API: there is no `/design-sessions/{sessionId}`, no session lookup by
 * id, no preview-render route, no asset route, no version route and no metadata
 * companion. The request is the address; the session is never one.
 *
 * ### Its own class, and its own domain key
 *
 * A third controller on the `admin/custom-requests` base path beside
 * `APP5-B04`'s reads and `APP5-B05`'s mutations, and — unlike those two — it
 * derives its own operation-id domain rather than joining `adminCustomRequest`
 * through `CONTROLLER_DOMAIN_KEYS`. That table exists to keep classes split for
 * *file-layout* reasons inside one published domain; this is a different
 * published surface with a different response contract and a different
 * dependency (a Design port neither of the others holds), so
 * `adminCustomRequestSubmittedDesign_get` is the honest id and no entry is
 * needed to mint it.
 *
 * ### Authorization is APP1's, plus the request
 *
 * ```text
 * Authenticated Admin
 *   + the exact requestId from this route
 *   + the server-owned custom_requests.submitted_session_id
 *   + an internal, correlated Design Session lookup
 * ```
 *
 * `AuthenticatedAdminGuard` is the same guard every other Admin route uses; no
 * cookie is parsed here and no caller-supplied Admin id is accepted. The
 * operator does **not** prove possession of the anonymous Design Session secret,
 * and nothing here fabricates, rotates or synthesizes one: the APP3 public
 * resume and bootstrap paths are not called, and no fake customer context is
 * built to call them. `submitted_session_id` selects the source only after the
 * request itself has been authorised.
 *
 * ### Privacy posture
 *
 * `Cache-Control: no-store`, because this is customer-private evidence. The
 * session id travels in no query string — there is no query parameter on this
 * operation at all — and the document body is never logged; the platform's
 * request logging records route, method and status and is unchanged.
 *
 * ### It renders nothing
 *
 * The response is the persisted document. Rendering authority is unchanged and
 * lives elsewhere: safe formal `DesignDocument` → the APP3 native-SVG renderer →
 * the `APP3-S09` runtime watermark → the UI. Nothing here rasterizes, produces a
 * derivative or offers a download.
 */
import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { ReadSubmittedDesign } from '../application/admin/read-submitted-design.query';
import { guardedAdminRequestRead } from '../domain/admin/admin-request-read.errors';
import {
  AdminSubmittedDesignResponse,
  AdminSubmittedDesignSourceResponse,
  type AdminSubmittedDesignPayload,
} from './schemas/admin-submitted-design.response';
import { AdminCustomRequestIdParam } from './schemas/admin-custom-request.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Customer-private design evidence must never be cached by a shared proxy. */
const SUBMITTED_DESIGN_CACHE_CONTROL = 'no-store';

@ApiTags('adminCustomRequestSubmittedDesign')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminSubmittedDesignResponse, AdminSubmittedDesignSourceResponse)
export class AdminCustomRequestSubmittedDesignController {
  constructor(private readonly submittedDesigns: ReadSubmittedDesign) {}

  @Get(':requestId/submitted-design')
  @Header('Cache-Control', SUBMITTED_DESIGN_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_SUBMITTED_DESIGN_READ', 'Submitted design source retrieved.')
  @ApiOperation({
    summary: 'Get the design a custom request was submitted from',
    description:
      'The digitizing source: the Design Session document the customer actually submitted, ' +
      'read from the exact session the request itself records. The operator addresses the ' +
      'request, never a session — no session id is accepted and no Design Session secret is ' +
      'required, fabricated or rotated. A customer-owned-product request has no Design Session ' +
      'by design and answers `200` with `submittedDesign: null`; so does a Catalog request ' +
      'whose pointed session is no longer available. The document is returned exactly as ' +
      'persisted — this is source data, not a rendered preview, and no secret, storage key or ' +
      'customer credential appears anywhere in the response. It is a read: nothing is written, ' +
      'no session state moves and no design version is created.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The submitted design source, or an explicit absence.',
    schema: envelopeSchemaOf(AdminSubmittedDesignResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  async get(@Param() params: AdminCustomRequestIdParam): Promise<AdminSubmittedDesignPayload> {
    return guardedAdminRequestRead(async () => {
      const view = await this.submittedDesigns.read(params.requestId);
      if (view.submittedDesign === undefined) {
        return { submittedDesign: null };
      }
      // Written field by field rather than spread, so the port has nowhere to
      // put a property it gains later — the same rule `APP5-B04`'s two
      // projections follow, and the reason a secret column added upstream could
      // not reach this response by accident.
      return {
        submittedDesign: {
          sessionId: view.submittedDesign.sessionId,
          document: view.submittedDesign.document,
          documentSchemaVersion: view.submittedDesign.documentSchemaVersion,
          revision: view.submittedDesign.revision,
        },
      };
    });
  }
}
