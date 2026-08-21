/**
 * The two Admin design-version operations (`APP6-B08`).
 *
 * ```text
 * POST /api/admin/custom-requests/{requestId}/design-versions
 *      — adminCustomRequestDesignVersion_create
 * GET  /api/admin/custom-requests/{requestId}/design-versions
 *      — adminCustomRequestDesignVersion_list
 * ```
 *
 * Two operations, and it stays two. There is deliberately no design-case create,
 * no `/design-cases/{caseId}` detail, no `/design-versions/{versionId}` detail,
 * no current-version mutation, no `/send`, no `/review` and no generic lifecycle
 * route. `APP6-B09` owns sending a version for review; `B10`/`B11` own the
 * customer decision surfaces.
 *
 * ### The request is the address; the design case never is
 *
 * Both routes hang off the request because that is where the authority lives:
 * `APP5` created the case for this request at submission, `TR-LC08-01`'s
 * eligibility is a fact about the *request*, and the branch is derived from the
 * request's own subject. A caller-supplied `designCaseId` would be a way to
 * redirect authoring onto another request's design thread, so no parameter, path
 * segment or body field accepts one. The server resolves
 * `requestId → custom_requests.current_design_case_id → the case`, and requires
 * the case to name the request back.
 *
 * ### Its own class, and its own domain key
 *
 * A fifth controller on the `admin/custom-requests` base path, and — like
 * `APP6-B07` — it derives its own operation-id domain rather than joining
 * `adminCustomRequest` through `CONTROLLER_DOMAIN_KEYS`. That table exists to
 * keep classes split for *file-layout* reasons inside one published domain; this
 * is a different published surface with its own response contract and its own
 * dependencies, so `adminCustomRequestDesignVersion_*` is the honest id and no
 * entry is needed to mint it. `APP5-B04`'s ids are untouched.
 *
 * ### Guards match what each verb does
 *
 * The mutation carries `StaffOriginGuard` and `StaffJsonBodyGuard` beside the
 * Admin guard — the exact combination every Admin write in this repository uses.
 * The `GET` carries neither, and that is not an oversight: a JSON-body guard on
 * a request with no body, and an origin guard on a read, would be cargo-cult
 * decoration that later readers would copy onto routes where it means something.
 *
 * ### It renders nothing and sends nothing
 *
 * No raster, no derivative, no preview and no download. Nothing here moves a
 * request's status, freezes a document, computes a hash, supersedes a version,
 * emits `design.review-ready` or creates an Approval Snapshot.
 */
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { AuthorDesignVersionUseCase } from '../application/author-design-version.use-case';
import { ListDesignVersionsQuery } from '../application/list-design-versions.query';
import { projectVersion, type DesignVersionView } from '../application/design-version.projection';
import { guardedDesignVersionAction } from './design-version-http-errors';
import {
  AuthorDesignVersionBody,
  DesignVersionRequestParam,
} from './schemas/admin-design-version.request';
import {
  DesignVersionCreatedResponse,
  DesignVersionListResponse,
  DesignVersionResponse,
  DesignVersionReviewResponse,
  type DesignVersionCreatedPayload,
  type DesignVersionListPayload,
} from './schemas/admin-design-version.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Customer-private design evidence must never be cached by a shared proxy. */
const DESIGN_VERSION_CACHE_CONTROL = 'no-store';

@ApiTags('adminCustomRequestDesignVersion')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(
  DesignVersionCreatedResponse,
  DesignVersionListResponse,
  DesignVersionResponse,
  DesignVersionReviewResponse,
)
export class AdminCustomRequestDesignVersionController {
  constructor(
    private readonly authoring: AuthorDesignVersionUseCase,
    private readonly versions: ListDesignVersionsQuery,
  ) {}

  @Post(':requestId/design-versions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', DESIGN_VERSION_CACHE_CONTROL)
  @ApiSuccessCode('DESIGN_VERSION_CREATED', 'Design version drafted.')
  @ApiOperation({
    summary: 'Create a draft design version on this request’s design case',
    description:
      'Appends one new DRAFT version to the design case this request already has — `TR-LC08-01`. ' +
      'The request must be DIGITIZING or DESIGN_REVIEW; there is no override. The design case is ' +
      'resolved from the request’s own pointer and no case id is accepted. The placement branch ' +
      'is derived server-side: a catalog request freezes the authoritative product, variant, ' +
      'side and area, and fails loudly rather than substituting a missing one; a ' +
      'customer-owned-product request freezes its own product id, both agreed placement labels, ' +
      'and the positive embroidery placement envelope supplied here — never the customer item’s ' +
      'own dimensions. History is append-only: no existing version is edited, and a revision is ' +
      'another version. This does not send the version for review, does not move the request, ' +
      'does not compute a document hash and emits no notification.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'The drafted version.',
    schema: envelopeSchemaOf(DesignVersionCreatedResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request id or body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The request is not eligible, or its case/placement no longer resolves.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'The placement details or the design document were rejected.',
    schema: ERROR_SCHEMA,
  })
  async create(
    @Param() params: DesignVersionRequestParam,
    @Body() body: AuthorDesignVersionBody,
  ): Promise<DesignVersionCreatedPayload> {
    return guardedDesignVersionAction(async () => {
      const version = await this.authoring.author({
        customRequestId: params.requestId as CustomRequestId,
        document: body.document,
        placementSideLabel: body.placementSideLabel,
        placementAreaLabel: body.placementAreaLabel,
        physicalWidthMm: body.physicalWidthMm,
        physicalHeightMm: body.physicalHeightMm,
      });
      // A freshly created version is the case's current one and has no reviews;
      // both are stated rather than re-read, because re-reading them would be a
      // second query answering a question this transaction just decided.
      return { version: toResponse(projectVersion(version, version.id, [])) };
    });
  }

  @Get(':requestId/design-versions')
  @Header('Cache-Control', DESIGN_VERSION_CACHE_CONTROL)
  @ApiSuccessCode('DESIGN_VERSION_LIST_READ', 'Design versions retrieved.')
  @ApiOperation({
    summary: 'List this request’s design versions with their review outcomes',
    description:
      'Every formal version of the design case this request points at, oldest first, with the ' +
      'customer decisions actually recorded against each. Superseded and void versions stay ' +
      'visible — a history that hid them could not explain how the current version was arrived ' +
      'at. Review outcomes are read from the review records, never inferred from a version’s ' +
      'status, so a draft and a never-decided version both report none. The design document ' +
      'itself is not included: this is history, not source. It is a read — nothing is written ' +
      'and no lock is taken.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The design case and its versions.',
    schema: envelopeSchemaOf(DesignVersionListResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'This request has no resolvable design case.',
    schema: ERROR_SCHEMA,
  })
  async list(@Param() params: DesignVersionRequestParam): Promise<DesignVersionListPayload> {
    return guardedDesignVersionAction(async () => {
      const history = await this.versions.list(params.requestId as CustomRequestId);
      return {
        designCaseId: history.designCaseId,
        versions: history.versions.map(toResponse),
      };
    });
  }
}

/**
 * The view, as the published shape.
 *
 * Written field by field rather than spread, the rule `APP5-B04` and `APP6-B07`
 * both follow: the view type has nowhere to put a property it gains later, so a
 * field added upstream cannot reach this response by accident. `undefined` is
 * converted to `null` here, once, because the contract publishes every field as
 * always-present-and-possibly-null rather than sometimes-absent.
 */
function toResponse(view: DesignVersionView): DesignVersionResponse {
  return {
    versionId: view.versionId,
    version: view.version,
    status: view.status,
    parentVersionId: view.parentVersionId ?? null,
    documentSchemaVersion: view.documentSchemaVersion,
    branch: view.branch,
    productId: view.productId ?? null,
    productVariantId: view.productVariantId ?? null,
    productSideId: view.productSideId ?? null,
    embroideryAreaId: view.embroideryAreaId ?? null,
    placementSideLabel: view.placementSideLabel ?? null,
    placementAreaLabel: view.placementAreaLabel ?? null,
    physicalWidthMm: view.physicalWidthMm,
    physicalHeightMm: view.physicalHeightMm,
    current: view.current,
    sentAt: view.sentAt?.toISOString() ?? null,
    approvedAt: view.approvedAt?.toISOString() ?? null,
    reviews: view.reviews.map((review) => ({
      outcome: review.outcome,
      decidedAt: review.decidedAt.toISOString(),
    })),
  };
}
