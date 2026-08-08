/**
 * The three Admin Design Template operations (`APP3-B03`).
 *
 *   POST /api/admin/design-templates              — adminDesignTemplate_create
 *   GET  /api/admin/design-templates              — adminDesignTemplate_list
 *   GET  /api/admin/design-templates/:templateId  — adminDesignTemplate_detail
 *
 * There is no fourth. `PUT …/:templateId/document` is `APP3-B03A`, and
 * publish/unpublish/archive are `APP3-B04`; a route for either appearing here
 * would be the four-into-three contract the `B03_CONTRACT_RULING` split exists
 * to prevent.
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
  Query,
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

  /**
   * The single translation point from the feature's transport-free error type to
   * the canonical HTTP exception. Anything else propagates untouched and is
   * sanitised by the platform filter, which is the correct treatment for an
   * unreviewed failure.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      throw isDesignTemplateDraftError(error) ? toHttpException(error) : error;
    }
  }
}
