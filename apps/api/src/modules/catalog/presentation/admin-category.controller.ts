/**
 * The four Admin category operations (`APP12-C02`).
 *
 * ```text
 * GET   /api/admin/categories                          — adminCategory_list
 * POST  /api/admin/categories                          — adminCategory_create
 * PATCH /api/admin/categories/{categoryId}             — adminCategory_update
 * POST  /api/admin/categories/{categoryId}/transitions — adminCategory_transition
 * ```
 *
 * **One transitions collection, not two verbs.** Publish and archive are the
 * same command against the same aggregate under the same guards, differing in
 * the target state and in what that state implies — exactly the argument
 * `AdminProductionTransitionController` makes for LC-18. Two routes would
 * publish two operation ids for one state machine, and a client would have to
 * know which move the lifecycle permits before it could ask, which is the
 * server's job.
 *
 * **There is no delete route, and there will not be one in APP12.** `ARCHIVED`
 * is the terminal state of this surface: a category's Products keep a real
 * foreign key to it (REL-020 `restrict`), so deleting one would either fail or
 * take history with it.
 *
 * The controller owns the HTTP contract and nothing else: guards, status codes,
 * documentation, and turning a transport-free `AdminCategoryError` into the
 * canonical exception. Every rule about the lifecycle, slug immutability, the
 * archive dependency guard and concurrency lives behind the service boundary.
 *
 * Authentication is APP1's, unchanged: `AuthenticatedAdminGuard` at controller
 * level and `StaffOriginGuard` + `StaffJsonBodyGuard` on every mutation — the
 * exact combination every Admin mutation in this repository uses. No handler
 * accepts an operator identity; the actor is bound by the guard and read from
 * the request context inside the use case.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { AdminCategoryQuery } from '../application/admin-category.query';
import { AdminCategoryService } from '../application/admin-category.service';
import type {
  AdminCategoryListView,
  AdminCategoryView,
} from '../application/admin-category.projection';
import { isAdminCategoryError, toHttpException } from '../domain/admin-category.errors';
import {
  AdminCategoryListItemResponse,
  AdminCategoryListResponse,
  AdminCategoryResponse,
} from './schemas/admin-category.response';
import {
  CategoryIdParam,
  CreateCategoryBody,
  TransitionCategoryBody,
  UpdateCategoryBody,
} from './schemas/admin-category.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const TOKEN_DESCRIPTION =
  'Requires `expectedUpdatedAt`, the `updatedAt` token last read for this category. A stale ' +
  'value is refused as `CATEGORY_VERSION_CONFLICT` rather than overwriting a concurrent ' +
  'change, and a successful write advances the token.';

@ApiTags('adminCategory')
@ApiCookieAuth('adminSession')
@Controller('admin/categories')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(AdminCategoryResponse, AdminCategoryListResponse, AdminCategoryListItemResponse)
export class AdminCategoryController {
  constructor(
    private readonly categories: AdminCategoryService,
    private readonly query: AdminCategoryQuery,
  ) {}

  @Get()
  @ApiSuccessCode('CATEGORY_LIST_READ', 'Categories retrieved.')
  @ApiOperation({
    operationId: 'adminCategory_list',
    summary: 'List every category, in every state',
    description:
      'The canonical Admin category inventory: draft, published and archived alike, ordered ' +
      'by `displayOrder` then `slug`. Unpaged and unfiltered — a taxonomy is navigation, not ' +
      'a feed, and a screen that wants a subset filters on the `status` each item carries. ' +
      'Each item reports `publishedProductCount`, counted from the products themselves, so an ' +
      'operator can see before attempting it whether an archive will be refused. ' +
      'This is the Admin authority for which categories exist; `publicCategory_list` answers ' +
      'the different question of which ones a customer may browse.',
  })
  @ApiResponse({
    status: 200,
    description: 'The complete taxonomy.',
    schema: envelopeSchemaOf(AdminCategoryListResponse),
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 503,
    description: 'The taxonomy exceeds what one response may carry; nothing partial is sent.',
    schema: ERROR_SCHEMA,
  })
  async list(): Promise<AdminCategoryListView> {
    return this.guarded(() => this.query.list());
  }

  @Post()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('CATEGORY_CREATED', 'Category created.')
  @ApiOperation({
    operationId: 'adminCategory_create',
    summary: 'Create a draft category',
    description:
      'Creates a category in `DRAFT`. The client never chooses the initial state and there is ' +
      'no create-and-publish shortcut: publication is a separate guarded decision, because it ' +
      'is the moment a public URL comes into existence. The slug must be a valid slug and ' +
      'globally unique across every lifecycle state — an archived category still owns its ' +
      'address. Nothing is inferred: the slug is not derived from the name, no product is ' +
      'seeded, and no other category is renumbered.',
  })
  @ApiBody({ type: CreateCategoryBody })
  @ApiResponse({
    status: 201,
    description: 'The created draft.',
    schema: envelopeSchemaOf(AdminCategoryResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Another category already uses that slug (`CATEGORY_SLUG_CONFLICT`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async create(@Body() body: CreateCategoryBody): Promise<AdminCategoryView> {
    return this.guarded(() =>
      this.categories.create({
        slug: body.slug,
        name: body.name,
        isIndexable: body.isIndexable,
        displayOrder: body.displayOrder,
      }),
    );
  }

  @Patch(':categoryId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @ApiSuccessCode('CATEGORY_UPDATED', 'Category updated.')
  @ApiOperation({
    operationId: 'adminCategory_update',
    summary: 'Edit a category',
    description:
      'Changes `name`, `isIndexable`, `displayOrder` and — while the category is still DRAFT ' +
      '— `slug`. Every one of them is data: a rename or a re-order is visible on the next ' +
      'public read, with no deployment.\n\n' +
      '`slug` is refused as `CATEGORY_SLUG_IMMUTABLE` once the category is PUBLISHED or ' +
      'ARCHIVED. A published slug is a public URL key the storefront filters on and the ' +
      'sitemap advertises, and this contract delivers no redirect and no alias — so renaming ' +
      'a live address would silently break every link to it. Renaming the `name` is always ' +
      'allowed and never touches the slug.\n\n' +
      'An ARCHIVED category is read-only. This operation never changes `status` or ' +
      '`archivedAt`: lifecycle moves only through the transitions collection. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @ApiBody({ type: UpdateCategoryBody })
  @ApiResponse({
    status: 200,
    description: 'The updated category.',
    schema: envelopeSchemaOf(AdminCategoryResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or a patch that changes nothing.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'No such category (`CATEGORY_NOT_FOUND`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'A slug change on a published or archived category (`CATEGORY_SLUG_IMMUTABLE`), a slug ' +
      'another category holds (`CATEGORY_SLUG_CONFLICT`), any edit to an archived category ' +
      '(`CATEGORY_INVALID_TRANSITION`), or a stale token (`CATEGORY_VERSION_CONFLICT`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async update(
    @Param() params: CategoryIdParam,
    @Body() body: UpdateCategoryBody,
  ): Promise<AdminCategoryView> {
    return this.guarded(() =>
      this.categories.update({
        categoryId: params.categoryId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
        slug: body.slug,
        name: body.name,
        isIndexable: body.isIndexable,
        displayOrder: body.displayOrder,
      }),
    );
  }

  @Post(':categoryId/transitions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('CATEGORY_TRANSITIONED', 'Category transitioned.')
  @ApiOperation({
    operationId: 'adminCategory_transition',
    summary: 'Publish or archive one category',
    description:
      'Moves the category through its one-way lifecycle: `PUBLISH` takes a DRAFT to ' +
      'PUBLISHED, `ARCHIVE` takes a PUBLISHED to ARCHIVED. Any other move — re-drafting a ' +
      'published category, relisting or archiving a draft — is refused as ' +
      '`CATEGORY_INVALID_TRANSITION`.\n\n' +
      '**PUBLISH** makes the category visible through `publicCategory_list`, assignable to a ' +
      'product, and eligible for the sitemap when `isIndexable` is true — on the next read, ' +
      'with no deployment. It seeds no product and never changes `isIndexable`.\n\n' +
      '**ARCHIVE** is refused while one or more PUBLISHED products still sit in the category ' +
      '(`CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS`): reassign or unpublish them first. ' +
      'Nothing is auto-reassigned, auto-unpublished or moved to a fallback category — there ' +
      'is no fallback category. The dependency is re-counted inside the transaction against a ' +
      'locked row, so a product being published concurrently under the same category either ' +
      'blocks the archive or is itself refused; the committed state is never an archived ' +
      'category with a published product in it. On success `archivedAt` is stamped and the ' +
      'category leaves every public read. It is not a delete: the row, its products and their ' +
      'history all survive. ' +
      TOKEN_DESCRIPTION,
  })
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @ApiBody({ type: TransitionCategoryBody })
  @ApiResponse({
    status: 200,
    description: 'The transitioned category.',
    schema: envelopeSchemaOf(AdminCategoryResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'No such category (`CATEGORY_NOT_FOUND`).',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'The lifecycle does not allow that move from the current state ' +
      '(`CATEGORY_INVALID_TRANSITION`), a published product still depends on the category ' +
      '(`CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS`), or the token is stale ' +
      '(`CATEGORY_VERSION_CONFLICT`). Nothing was committed.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async transition(
    @Param() params: CategoryIdParam,
    @Body() body: TransitionCategoryBody,
  ): Promise<AdminCategoryView> {
    return this.guarded(() =>
      this.categories.transition({
        categoryId: params.categoryId,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
        action: body.action,
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
      throw isAdminCategoryError(error) ? toHttpException(error) : error;
    }
  }
}
