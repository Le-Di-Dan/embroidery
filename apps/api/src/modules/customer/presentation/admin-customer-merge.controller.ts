/**
 * The three merge lifecycle operations (`APP10-B02`).
 *
 * ```text
 * POST /api/admin/customer-merges                  — adminCustomerMerge_open
 * GET  /api/admin/customer-merges/{caseId}         — adminCustomerMerge_detail
 * POST /api/admin/customer-merges/{caseId}/reject  — adminCustomerMerge_reject
 * POST /api/admin/customer-merges/{caseId}/execute — adminCustomerMerge_execute (APP10-B03)
 * ```
 *
 * Four, and no fifth. There is no approve, no cancel, no reopen, no undo, no bulk
 * merge, no customer list and no duplicate-candidate search: both participants
 * are found with the delivered exact-contact resolver, which is the one lookup
 * this system has.
 *
 * ### The execute route is bodyless, and that is the security property
 *
 * `POST {caseId}/execute` takes **no body**. Survivor and loser come from the
 * case an operator already opened and reviewed; a body could only repeat them,
 * and a repeated id is an id a caller could change. Nothing here lets a request
 * choose which identity survives, override an eligibility rule, skip a step or
 * pass an execution option, so the only thing an execute request decides is
 * *which case* to execute. `StaffJsonBodyGuard` is therefore absent from it:
 * there is no JSON to type-check, and adding a body so the guard would have
 * something to check would be inventing an attack surface to protect it.
 * * ### A separate class, and the operation ids follow from it
 *
 * `createOperationId` derives `adminCustomerMerge_open` from
 * `AdminCustomerMergeController#open`, which is the published identity
 * `APP10-G01` §E.2 fixed. Reaching these from `AdminCustomerSupportController`
 * would have produced `adminCustomerSupport_*` — naming a merge decision after a
 * support read — and would have made the class that answers "show me this
 * customer" also the class that proposes joining two of them.
 *
 * ### Its own path root, not a sub-resource of a customer
 *
 * `admin/customer-merges` rather than `admin/customers/{id}/merges`, because a
 * merge case belongs to *two* customers and neither is more its owner than the
 * other. Nesting it would have made the choice of parent arbitrary and would
 * have implied that a merge is something done to one record.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` on the controller, plus `StaffOriginGuard` on all
 * three and `StaffJsonBodyGuard` on the two that read a body — the exact
 * treatment `adminSecureGrant_revoke` and `APP10-B01` use. Both mutations carry
 * a body, so the JSON content-type guard has something to check; the GET is
 * behind the origin guard for the same reason every other read on this surface
 * is. This controller parses no cookie, looks up no session, accepts no
 * caller-supplied Admin id and defines no guard of its own. There is no role
 * check because there is no role model: APP1-B01 is a binary authenticated-admin
 * gate, and inventing a permission matrix for merge would be a security model
 * with no authority behind it.
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
import { CustomerMergeCaseQuery } from '../application/customer-merge-case.query';
import { ExecuteCustomerMerge } from '../application/execute-customer-merge.use-case';
import { OpenCustomerMergeCase } from '../application/open-customer-merge-case.use-case';
import { RejectCustomerMergeCase } from '../application/reject-customer-merge-case.use-case';
import { guardedCustomerMerge } from '../domain/merge/customer-merge.errors';
import { ADMIN_SUPPORT_CACHE_CONTROL } from '../domain/support/admin-support.policy';
import type { CustomerMergeCaseId } from '../domain/repositories/customer-merge-case.repository';
import type { CustomerId } from '../domain/repositories/customer.repository';
import {
  AdminCustomerMergeCaseParams,
  OpenCustomerMergeBody,
  RejectCustomerMergeBody,
} from './schemas/admin-customer-merge.request';
import { toCasePayload } from './schemas/admin-customer-merge.projection';
import {
  AdminCustomerMergeCaseResponse,
  AdminCustomerMergeExecutedResponse,
  AdminCustomerMergeOpenedResponse,
  MergeBusinessProfileReadinessResponse,
  MergeConsequencePreviewResponse,
  MergeParticipantContactResponse,
  MergeParticipantResponse,
  type AdminCustomerMergeCasePayload,
  type AdminCustomerMergeExecutedPayload,
  type AdminCustomerMergeOpenedPayload,
} from './schemas/admin-customer-merge.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const ORIGIN_REFUSAL = 'The request states an origin outside the Admin allowlist.';
const NO_SESSION = 'No live Admin session.';

@ApiTags('adminCustomerMerge')
@ApiCookieAuth('adminSession')
@Controller('admin/customer-merges')
@UseGuards(AuthenticatedAdminGuard, StaffOriginGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  MergeParticipantContactResponse,
  MergeParticipantResponse,
  MergeBusinessProfileReadinessResponse,
  MergeConsequencePreviewResponse,
  AdminCustomerMergeCaseResponse,
  AdminCustomerMergeOpenedResponse,
  AdminCustomerMergeExecutedResponse,
)
export class AdminCustomerMergeController {
  constructor(
    private readonly opener: OpenCustomerMergeCase,
    private readonly cases: CustomerMergeCaseQuery,
    private readonly rejector: RejectCustomerMergeCase,
    private readonly executor: ExecuteCustomerMerge,
  ) {}

  /**
   * 201, and it publishes the case id and its state — nothing else.
   *
   * A resource is genuinely created, so 201 rather than the 204 `APP10-B01`'s
   * transitions answer with. What it returns is the minimum a client needs to
   * address the case it just opened; the two Customer cards and the consequence
   * preview belong to the detail read, and republishing them from a mutation
   * would create a second place a masked contact is rendered.
   */
  @Post()
  @UseGuards(StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  // `no-store` on every response of this surface: the rule is easier to keep
  // than to remember exceptions to, and a cached merge case would associate two
  // Customer identities in a shared proxy.
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_MERGE_OPENED', 'Merge case opened.')
  @ApiOperation({
    summary: 'Open a Customer merge case',
    description:
      'Records that an operator proposes merging one Customer into another, with a mandatory ' +
      'reason. **Nothing is merged.** No contact is moved, no access grant revoked, no request, ' +
      'order or asset repointed and no Customer tombstoned — the case is a decision waiting to ' +
      'be made. The surviving and merged-away Customers are exactly the two stated in the body ' +
      'and are never swapped, defaulted or inferred; a Customer already merged into another is ' +
      'refused as either participant, and merge chains are never followed. Both ids come from ' +
      'the exact-contact resolver: this operation accepts no email and no phone number. One ' +
      'open case may exist per ordered pair, arbitrated by a unique index, so two simultaneous ' +
      'requests for the same pair cannot both succeed.',
  })
  @ApiBody({ type: OpenCustomerMergeBody })
  @ApiResponse({
    status: 201,
    description: 'The merge case was opened, in REQUESTED.',
    schema: envelopeSchemaOf(AdminCustomerMergeOpenedResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed body, an unknown field, an over-long or blank reason, or the same Customer ' +
      'named as both survivor and loser.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: NO_SESSION, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_REFUSAL, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No such surviving Customer, or no such merged-away Customer.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'Either Customer has already been merged into another, or a merge case is already open ' +
      'for this pair.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async open(@Body() body: OpenCustomerMergeBody): Promise<AdminCustomerMergeOpenedPayload> {
    return guardedCustomerMerge(async () => {
      const opened = await this.opener.open({
        survivorCustomerId: body.survivorCustomerId as CustomerId,
        loserCustomerId: body.loserCustomerId as CustomerId,
        reason: body.reason,
      });
      return { mergeCaseId: opened.id, status: opened.status };
    });
  }

  @Get(':caseId')
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_MERGE_READ', 'Merge case retrieved.')
  @ApiOperation({
    summary: 'Get one merge case and its consequence preview',
    description:
      'The case, both Customers as masked identity cards, and a read-only preview of what ' +
      'executing this merge would move or revoke. Contacts are returned masked and only ' +
      'masked — the raw, normalized and display values are never published, on either side. ' +
      'The preview counts only **live** identity references: contact points, active secure ' +
      'access grants, custom requests, orders, uploaded assets and the business profile. ' +
      'Frozen commercial evidence is excluded by design — approval snapshots, quotation ' +
      'acceptances, design reviews, audit events and every append-only transition history keep ' +
      'their original Customer, because a merge records a decision and never rewrites what a ' +
      'customer already agreed to. The counts are computed from current rows on every read, ' +
      'stored nowhere and advisory: execution re-evaluates state inside its own transaction. ' +
      'This is a read — it writes no row, changes no state and appends no merge event.',
  })
  @ApiParam({ name: 'caseId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The merge case, both masked Customers, and the consequence preview.',
    schema: envelopeSchemaOf(AdminCustomerMergeCaseResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed case id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: NO_SESSION, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_REFUSAL, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such merge case.', schema: ERROR_SCHEMA })
  async detail(
    @Param() params: AdminCustomerMergeCaseParams,
  ): Promise<AdminCustomerMergeCasePayload> {
    return guardedCustomerMerge(async () =>
      toCasePayload(await this.cases.detail(params.caseId as CustomerMergeCaseId)),
    );
  }

  /**
   * 204, and it publishes nothing.
   *
   * Following `adminSecureGrant_revoke` and `APP10-B01`'s transitions. The
   * authorized projection of a merge case is the detail read and there is
   * exactly one of it; the client re-reads it, which it must do anyway to see
   * the state it now has.
   */
  @Post(':caseId/reject')
  @UseGuards(StaffJsonBodyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Reject a Customer merge case',
    description:
      'Declines a REQUESTED case with a mandatory reason. A lifecycle decision and nothing ' +
      'else: neither Customer changes, no merge pointer is written, no contact is moved, no ' +
      'access grant revoked, and no request, order or asset repointed. Only a REQUESTED case ' +
      'may be rejected — a case that is already rejected or executed is a conflict, not a ' +
      'quiet success, because the reason a second caller supplied would otherwise be silently ' +
      'discarded. The reason is recorded in the audit trail against the case.',
  })
  @ApiParam({ name: 'caseId', format: 'uuid' })
  @ApiBody({ type: RejectCustomerMergeBody })
  @ApiResponse({ status: 204, description: 'The merge case is rejected. No content.' })
  @ApiResponse({
    status: 400,
    description: 'Malformed case id or body, an unknown field, or a blank or over-long reason.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: NO_SESSION, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_REFUSAL, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such merge case.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The case has already been decided and can no longer be rejected.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async reject(
    @Param() params: AdminCustomerMergeCaseParams,
    @Body() body: RejectCustomerMergeBody,
  ): Promise<void> {
    await guardedCustomerMerge(() =>
      this.rejector.reject({
        mergeCaseId: params.caseId as CustomerMergeCaseId,
        rejectionReason: body.reason,
      }),
    );
  }

  /**
   * 200, and it publishes the case, its state and which of the two outcomes
   * this request produced.
   *
   * Not 204, unlike reject: a replay of an executed case is a **success that
   * changed nothing**, and a client shown an empty body could not tell it apart
   * from the request that performed the merge. Not 201 either — nothing was
   * created; a decision was carried out.
   *
   * The body carries no counts. What moved is recorded in the append-only merge
   * event history, which is evidence about data rather than a report to the
   * caller, and republishing it here would create a second figure to keep in
   * step with it.
   */
  @Post(':caseId/execute')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_MERGE_EXECUTED', 'Merge executed.')
  @ApiOperation({
    summary: 'Execute a Customer merge case',
    description:
      'Performs the merge a REQUESTED case describes, as one transaction: the merged-away Customer’s contact points move to the surviving Customer, its ACTIVE secure access grants are revoked, its custom requests, orders, uploaded assets and business profile are repointed, and it is finally tombstoned to point at the survivor. Either all of it commits or none of it does. Survivor and loser come from the case — this operation takes no body and cannot be told to merge a different pair, to swap them or to skip a step. Frozen commercial evidence is never rewritten: approval snapshots, quotation acceptances, design reviews, audit events and every append-only transition history keep the Customer they were taken against. Both Customer rows are locked in a fixed order, so two merges naming the same pair serialize instead of deadlocking, and the case row is locked first, so two simultaneous executions of one case cannot both perform it. Executing a case that was already executed is a success that changes nothing. The merge is refused, before anything is moved, when either Customer has already been merged away or when both Customers have a business profile — at most one may exist per Customer, and only a person can decide which to keep.',
  })
  @ApiParam({ name: 'caseId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The merge is executed, or had already been executed.',
    schema: envelopeSchemaOf(AdminCustomerMergeExecutedResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed case id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: NO_SESSION, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_REFUSAL, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such merge case.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The case was declined and can no longer be executed, either Customer has already been merged into another, both Customers have a business profile, or a contact could not be moved without discarding identity evidence. Nothing was merged.',
    schema: ERROR_SCHEMA,
  })
  async execute(
    @Param() params: AdminCustomerMergeCaseParams,
  ): Promise<AdminCustomerMergeExecutedPayload> {
    return guardedCustomerMerge(async () => {
      const result = await this.executor.execute(params.caseId as CustomerMergeCaseId);
      return {
        mergeCaseId: result.mergeCase.id,
        status: result.mergeCase.status,
        outcome: result.disposition === 'ALREADY_EXECUTED' ? 'ALREADY_EXECUTED' : 'EXECUTED',
      };
    });
  }
}
