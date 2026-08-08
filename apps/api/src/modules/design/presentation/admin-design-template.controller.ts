/**
 * The Admin Design Template operations (`APP3-B03` + `APP3-B03A`).
 *
 *   POST /api/admin/design-templates                   — adminDesignTemplate_create
 *   GET  /api/admin/design-templates                   — adminDesignTemplate_list
 *   GET  /api/admin/design-templates/:templateId       — adminDesignTemplate_detail
 *   PUT  /api/admin/design-templates/:id/document      — adminDesignTemplate_saveDocument
 *
 * Four, and no fifth. The first three are `APP3-B03`; the save is `APP3-B03A`,
 * the checkpoint the `B03_CONTRACT_RULING` split created for it precisely so the
 * document, the immutable version, the Asset association and the normalization
 * producer would be reviewed on their own. Publish, unpublish and archive are
 * `APP3-B04` and a route for any of them appearing here would be that split
 * undone.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `DesignTemplateDraftError` into
 * the canonical exception. Scope validity, slug reservation and Audit live
 * behind the service boundary.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { DesignTemplateDraftService } from '../application/design-template-draft.service';
import { DesignTemplateQuery } from '../application/design-template.query';
import {
  SaveTemplateDocumentUseCase,
  TemplateDocumentRejectedError,
} from '../application/save-template-document.use-case';
import type {
  TemplateDetailView,
  TemplateListView,
} from '../application/design-template-projection';
import {
  isDesignTemplateDraftError,
  toHttpException,
} from '../domain/design-template-draft.errors';
import {
  AdminDesignTemplateDetailResponse,
  AdminDesignTemplateListResponse,
} from './schemas/admin-design-template.response';
import {
  CreateDesignTemplateBody,
  DESIGN_TEMPLATE_STATUS_FILTERS,
  DesignTemplateIdParam,
  ListDesignTemplatesQuery,
  SaveDesignTemplateDocumentBody,
} from './schemas/admin-design-template.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminDesignTemplate')
@ApiCookieAuth('adminSession')
@Controller('admin/design-templates')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminDesignTemplateDetailResponse, AdminDesignTemplateListResponse)
export class AdminDesignTemplateController {
  constructor(
    private readonly drafts: DesignTemplateDraftService,
    private readonly query: DesignTemplateQuery,
    private readonly saves: SaveTemplateDocumentUseCase,
  ) {}

  @Get()
  @ApiSuccessCode('DESIGN_TEMPLATE_LIST_READ', 'Design templates retrieved.')
  @ApiOperation({
    summary: 'List Admin design templates',
    description:
      'Keyset-paginated, newest first. There is no offset paging and no total count. ' +
      'With no status filter the page carries drafts, published and archived templates alike. ' +
      'List items carry no version summary and no document; open the detail read for those.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'status', required: false, enum: DESIGN_TEMPLATE_STATUS_FILTERS })
  @ApiQuery({
    name: 'productId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
    description: 'Only templates scoped to this Product.',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of design templates.',
    schema: envelopeSchemaOf(AdminDesignTemplateListResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  async list(@Query() query: ListDesignTemplatesQuery): Promise<TemplateListView> {
    return this.guarded(() => this.query.list(query));
  }

  @Get(':templateId')
  @ApiSuccessCode('DESIGN_TEMPLATE_DETAIL_READ', 'Design template retrieved.')
  @ApiOperation({
    summary: 'Get one Admin design template',
    description:
      'Returns the header, its placement scope when it has one, and the highest version with its ' +
      'canonical Design Document. A template with no version yet carries neither field — there ' +
      'is no version 0 and no synthesised empty document.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The design template.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such design template.', schema: ERROR_SCHEMA })
  async detail(@Param() params: DesignTemplateIdParam): Promise<TemplateDetailView> {
    return this.guarded(() => this.query.detail(params.templateId));
  }

  @Post()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('DESIGN_TEMPLATE_DRAFT_CREATED', 'Design template draft created.')
  @ApiOperation({
    summary: 'Create a design template draft',
    description:
      'Creates the header in DRAFT. The slug is derived from the name by the server and is the ' +
      'public address. The placement scope is optional but must be supplied as a complete ' +
      'product/side/area triple when supplied at all. **No version is created**: the template ' +
      'holds no document until its first save, which is APP3-B03A.',
  })
  @ApiBody({ type: CreateDesignTemplateBody })
  @ApiResponse({
    status: 201,
    description: 'The created draft, with no version.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or a partial or unresolvable placement scope.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'No template address could be reserved.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async create(@Body() body: CreateDesignTemplateBody): Promise<TemplateDetailView> {
    return this.guarded(() =>
      this.drafts.create({
        name: body.name,
        // Absent or blank both mean "no description"; the column keeps NULL.
        description:
          body.description === undefined || body.description.trim() === ''
            ? undefined
            : body.description,
        productId: body.productId,
        productSideId: body.productSideId,
        embroideryAreaId: body.embroideryAreaId,
      }),
    );
  }

  @Put(':templateId/document')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('DESIGN_TEMPLATE_VERSION_SAVED', 'Design template version saved.')
  @ApiOperation({
    summary: 'Save a design template draft document',
    description:
      'Saves a full Design Document snapshot for a DRAFT template as a new immutable version. ' +
      'Send `expectedCurrentVersion` exactly as the read returned it — `0` for a template that ' +
      'has no version yet. A stale value is rejected as a conflict and nothing is written; the ' +
      'server derives the next version number, and a saved version is never published by this ' +
      'operation.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: SaveDesignTemplateDocumentBody })
  @ApiResponse({
    status: 200,
    description: 'The template, at its new current version.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such design template.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'Stale `expectedCurrentVersion`, or a template that is not a DRAFT.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'The Design Document is malformed, too complex, or references unusable media.',
    schema: ERROR_SCHEMA,
  })
  async saveDocument(
    @Param() params: DesignTemplateIdParam,
    @Body() body: SaveDesignTemplateDocumentBody,
  ): Promise<TemplateDetailView> {
    return this.guarded(() =>
      this.saves.save({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
        document: body.document,
      }),
    );
  }

  /**
   * The single translation point from the feature's transport-free error types to
   * the canonical HTTP exception. Anything else propagates untouched and is
   * sanitised by the platform filter, which is the correct treatment for an
   * unreviewed failure.
   *
   * A refused document is a **422**, the same code `APP3-B08` publishes for the
   * same class of refusal: the request was well formed and the server understood
   * it, and the document itself is what could not be accepted.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (error instanceof TemplateDocumentRejectedError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw isDesignTemplateDraftError(error) ? toHttpException(error) : error;
    }
  }
}
