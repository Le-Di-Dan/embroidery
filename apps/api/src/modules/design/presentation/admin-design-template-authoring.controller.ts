/**
 * The Admin Design Template **authoring** operations.
 *
 *   POST /api/admin/design-templates                   — adminDesignTemplate_create
 *   GET  /api/admin/design-templates                   — adminDesignTemplate_list
 *   GET  /api/admin/design-templates/:templateId       — adminDesignTemplate_detail
 *   PUT  /api/admin/design-templates/:id/scope         — adminDesignTemplate_assignScope
 *   PUT  /api/admin/design-templates/:id/document      — adminDesignTemplate_saveDocument
 *
 * Five, and no sixth. Three are `APP3-B03`, the save is `APP3-B03A` and the
 * scope assignment is `APP3-B03B`. The four LC-24 transitions live in
 * `admin-design-template-lifecycle.controller.ts` — same route family, same
 * guards, same error translation, split by responsibility when `APP3-B04A`
 * closed `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`.
 *
 * `APP3-B03B` is the *initial* assignment only — it binds an unscoped, versionless
 * `DRAFT` to one placement and refuses everything else. There is no rescope and
 * no clear-scope route, and their absence is the ruling rather than an omission:
 * a saved version carries an immutable placement snapshot, so rescoping after one
 * exists would leave every stored document describing a placement the header no
 * longer claims. Public reads are `APP3-B05` and binary delivery is `APP3-B05A`;
 * a route for either appearing here would undo that split too.
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
import { AssignTemplateScopeUseCase } from '../application/assign-template-scope.use-case';
import { DesignTemplateDraftService } from '../application/design-template-draft.service';
import { DesignTemplateQuery } from '../application/design-template.query';
import { SaveTemplateDocumentUseCase } from '../application/save-template-document.use-case';
import type {
  TemplateDetailView,
  TemplateListView,
} from '../application/design-template-projection';
import { guardedTemplateOperation } from './design-template-http-errors';
import {
  AdminDesignTemplateDetailResponse,
  AdminDesignTemplateListResponse,
} from './schemas/admin-design-template.response';
import {
  AssignDesignTemplateScopeBody,
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
export class AdminDesignTemplateAuthoringController {
  constructor(
    private readonly drafts: DesignTemplateDraftService,
    private readonly query: DesignTemplateQuery,
    private readonly saves: SaveTemplateDocumentUseCase,
    private readonly scopeAssignment: AssignTemplateScopeUseCase,
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
    return guardedTemplateOperation(() => this.query.list(query));
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
    return guardedTemplateOperation(() => this.query.detail(params.templateId));
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
    return guardedTemplateOperation(() =>
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
    return guardedTemplateOperation(() =>
      this.saves.save({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
        document: body.document,
      }),
    );
  }

  @Put(':templateId/scope')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('DESIGN_TEMPLATE_SCOPE_ASSIGNED', 'Design template scope assigned.')
  @ApiOperation({
    summary: 'Assign the initial scope of a design template',
    description:
      'Binds an unscoped template to one exact product, side and embroidery area. This is a ' +
      'one-time initial assignment, not a rescope: it succeeds only while the template is a ' +
      'DRAFT with no version and no scope at all, and is refused once any scope or any version ' +
      'exists. All three ids are required together. No version, document or asset association ' +
      'is created and the lifecycle state does not change.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: AssignDesignTemplateScopeBody })
  @ApiResponse({
    status: 200,
    description: 'The template, now scoped, still a DRAFT with no version.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or a product/side/area chain that does not resolve.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such design template.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The template already has a scope, already has a version, or is not a DRAFT. Nothing ' +
      'was written.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async assignScope(
    @Param() params: DesignTemplateIdParam,
    @Body() body: AssignDesignTemplateScopeBody,
  ): Promise<TemplateDetailView> {
    return guardedTemplateOperation(() =>
      this.scopeAssignment.assign({
        templateId: params.templateId,
        productId: body.productId,
        productSideId: body.productSideId,
        embroideryAreaId: body.embroideryAreaId,
      }),
    );
  }
}
