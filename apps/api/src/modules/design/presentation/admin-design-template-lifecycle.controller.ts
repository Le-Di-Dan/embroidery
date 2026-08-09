/**
 * The Admin Design Template **lifecycle** operations — the four LC-24
 * transitions.
 *
 *   POST /api/admin/design-templates/:id/publish     — adminDesignTemplate_publish    TR-LC24-02
 *   POST /api/admin/design-templates/:id/unpublish   — adminDesignTemplate_unpublish  TR-LC24-03
 *   POST /api/admin/design-templates/:id/archive     — adminDesignTemplate_archive    TR-LC24-04/05
 *   POST /api/admin/design-templates/:id/restore     — adminDesignTemplate_restore    TR-LC24-06
 *
 * Four, and no fifth. Three are `APP3-B04` and restore is `APP3-B04A`. There is
 * no `ARCHIVED → PUBLISHED` route and no restore-and-publish alias: `IMP-D042`
 * PO-03 says restore always lands in `DRAFT`, and republication is the separate
 * guarded publish above, which re-runs the whole GRD-T01 set. There is no delete
 * either — `ARCHIVED` is retention, not removal.
 *
 * Split from `admin-design-template-authoring.controller.ts` when `APP3-B04A`
 * closed `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`. Same route family, same guards,
 * same error translation; the authoring surface writes documents and scopes,
 * this one moves a header between states and touches nothing else.
 */
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
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
import { DesignTemplateLifecycleUseCase } from '../application/design-template-lifecycle.use-case';
import type { TemplateDetailView } from '../application/design-template-projection';
import { guardedTemplateOperation } from './design-template-http-errors';
import { AdminDesignTemplateDetailResponse } from './schemas/admin-design-template.response';
import {
  ArchiveDesignTemplateBody,
  DesignTemplateIdParam,
  PublishDesignTemplateBody,
  RestoreDesignTemplateBody,
  UnpublishDesignTemplateBody,
} from './schemas/admin-design-template.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminDesignTemplate')
@ApiCookieAuth('adminSession')
@Controller('admin/design-templates')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminDesignTemplateDetailResponse)
export class AdminDesignTemplateLifecycleController {
  constructor(private readonly lifecycle: DesignTemplateLifecycleUseCase) {}

  @Post(':templateId/publish')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_TEMPLATE_PUBLISHED', 'Design template published.')
  @ApiOperation({
    summary: 'Publish a design template',
    description:
      'Moves a DRAFT to PUBLISHED, publishing its current immutable version. The full GRD-T01 ' +
      'guard runs first: a complete and active product/side/area chain, a document valid under ' +
      'APP3-P01, geometry in bounds for that exact area under APP3-P02, and every referenced ' +
      'Template asset editor-safe. No version is created and the document is never modified. ' +
      '`published_at` is stamped once and is not rewritten by a later republication.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: PublishDesignTemplateBody })
  @ApiResponse({
    status: 200,
    description: 'The published template.',
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
    description:
      'The template is not ready: no version, an incomplete or retired scope, an invalid ' +
      'document, geometry outside the area, or an ineligible asset.',
    schema: ERROR_SCHEMA,
  })
  async publish(
    @Param() params: DesignTemplateIdParam,
    @Body() body: PublishDesignTemplateBody,
  ): Promise<TemplateDetailView> {
    return guardedTemplateOperation(() =>
      this.lifecycle.publish({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
      }),
    );
  }

  @Post(':templateId/unpublish')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_TEMPLATE_UNPUBLISHED', 'Design template unpublished.')
  @ApiOperation({
    summary: 'Unpublish a design template',
    description:
      'Returns a PUBLISHED template to DRAFT. The header only: every version survives, no ' +
      '`published_at` is cleared, and no new version is created. This is not an archive — the ' +
      'template stays editable, and editing it creates a new immutable version.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: UnpublishDesignTemplateBody })
  @ApiResponse({
    status: 200,
    description: 'The unpublished template.',
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
    description: 'Stale `expectedCurrentVersion`, or a template that is not PUBLISHED.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async unpublish(
    @Param() params: DesignTemplateIdParam,
    @Body() body: UnpublishDesignTemplateBody,
  ): Promise<TemplateDetailView> {
    return guardedTemplateOperation(() =>
      this.lifecycle.unpublish({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
      }),
    );
  }

  @Post(':templateId/archive')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_TEMPLATE_ARCHIVED', 'Design template archived.')
  @ApiOperation({
    summary: 'Archive a design template',
    description:
      'Retires a DRAFT or a PUBLISHED template. This is not a delete and not an unpublish: the ' +
      'template, its immutable versions, their publication timestamps and its asset ' +
      'associations all remain, and nothing cascades to the Product, its assets or any Design ' +
      'Session. A reason is required and is recorded in the audit trail. An archived template ' +
      'can be restored to DRAFT.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: ArchiveDesignTemplateBody })
  @ApiResponse({
    status: 200,
    description: 'The archived template.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body or missing reason.',
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
    description: 'Stale `expectedCurrentVersion`, or a state that cannot be archived.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async archive(
    @Param() params: DesignTemplateIdParam,
    @Body() body: ArchiveDesignTemplateBody,
  ): Promise<TemplateDetailView> {
    return guardedTemplateOperation(() =>
      this.lifecycle.archive({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
        reason: body.reason,
      }),
    );
  }

  @Post(':templateId/restore')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('DESIGN_TEMPLATE_RESTORED', 'Design template restored.')
  @ApiOperation({
    summary: 'Restore an archived design template',
    description:
      'Returns an ARCHIVED template to DRAFT, the only editable state. The header only: every ' +
      'immutable version, every publication timestamp, the placement scope and every asset ' +
      'association survive exactly as they were, and the archive marker is cleared. No version ' +
      'or document is created, nothing is repaired and nothing cascades to any Design Session, ' +
      'clone or approval snapshot. **There is no publication guard** — restore never publishes, ' +
      'and a previously published template comes back as a draft that must be published again ' +
      'to become public. A reason is required and is recorded in the audit trail.',
  })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: RestoreDesignTemplateBody })
  @ApiResponse({
    status: 200,
    description: 'The restored template, back in DRAFT with its versions intact.',
    schema: envelopeSchemaOf(AdminDesignTemplateDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body or missing reason.',
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
    description: 'Stale `expectedCurrentVersion`, or a template that is not ARCHIVED.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async restore(
    @Param() params: DesignTemplateIdParam,
    @Body() body: RestoreDesignTemplateBody,
  ): Promise<TemplateDetailView> {
    return guardedTemplateOperation(() =>
      this.lifecycle.restore({
        templateId: params.templateId,
        expectedCurrentVersion: body.expectedCurrentVersion,
        reason: body.reason,
      }),
    );
  }
}
