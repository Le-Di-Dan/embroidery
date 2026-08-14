/**
 * The one Admin secure-grant operation (`APP4-B07`).
 *
 * ```text
 * POST /api/admin/secure-grants/{grantId}/revoke — adminSecureGrant_revoke
 * ```
 *
 * One, and no second. There is deliberately **no** Admin issue, reissue or
 * resolve route: issuance is a side effect of an authorized APP5 business
 * action through `SecureGrantIssuer` and has no HTTP surface anywhere
 * (`APP4_PHASE_ENTRY_AUDIT` §C.2), and resolution is `APP4-B06`'s anonymous
 * endpoint. An Admin "issue a link" button would be a way for staff to mint
 * somebody's only credential for a request outside the flow that is supposed to
 * create it. There is no global `GET /api/admin/secure-grants` either — a grant
 * list is reached through its Customer.
 *
 * A **separate controller** from `AdminCustomerSupportController` because the
 * route prefix differs and Nest derives the `operationId` from the class name;
 * folding this in would either publish it under `admin/customers` or rename the
 * two reads. Neither delivered controller is split, renamed or re-prefixed here,
 * so every prior operation id is untouched.
 *
 * ### The three guards, and which one is the auth guard
 *
 * `AuthenticatedAdminGuard` is the authentication guard, and the only one — the
 * same class every Admin route in the repository uses. `StaffOriginGuard` and
 * `StaffJsonBodyGuard` are APP1's CSRF layering (`ADR-APP1-001` §6), applied to
 * every Admin *mutation* in APP2 and APP3 and applied here for the same reason:
 * the session cookie is `SameSite=Strict`, and these two close the gap for a
 * cross-site form post. They authenticate nobody and this checkpoint defines no
 * guard of its own.
 *
 * ### 204, and why the response is empty
 *
 * A revocation has nothing to tell the caller that the caller does not already
 * know: the grant named in the path is now `REVOKED`. Returning a grant
 * projection from a mutation would be a second place for that shape to drift
 * from the list endpoint that owns it — and a second response body that a future
 * edit could put a token or a digest into. `POST /api/staff/session`'s delete
 * answers 204 for the same reason.
 */
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { RevokeSecureGrantUseCase } from '../application/revoke-secure-grant.use-case';
import { guardedAdminSupportOperation } from '../domain/support/admin-support.errors';
import type { GrantId } from '../domain/repositories/secure-access-grant.repository';
import { AdminGrantIdParam, RevokeSecureGrantBody } from './schemas/admin-support.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminSecureGrant')
@ApiCookieAuth('adminSession')
@Controller('admin/secure-grants')
@UseGuards(AuthenticatedAdminGuard)
export class AdminSecureGrantController {
  constructor(private readonly revocation: RevokeSecureGrantUseCase) {}

  @Post(':grantId/revoke')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a secure grant',
    description:
      'Withdraws a live secure grant, killing the link immediately: the token stops resolving ' +
      'in the same transaction the state changes. A reason is mandatory and non-blank — it is ' +
      'stored on the grant and copied into the audit trail, attributed to the authenticated ' +
      'Admin. Revocation is terminal and mints nothing: no replacement grant, no new token and ' +
      'no notification. Restoring access is a fresh issue through the business flow, never a ' +
      'second call here. Revoking a grant that is already revoked or expired is a conflict, ' +
      'not a silent success.',
  })
  @ApiParam({ name: 'grantId', format: 'uuid' })
  @ApiBody({ type: RevokeSecureGrantBody })
  @ApiResponse({ status: 204, description: 'The grant is revoked. No content.' })
  @ApiResponse({
    status: 400,
    description: 'Malformed grant id, or a missing or blank reason.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such secure grant.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The grant is no longer active, so there is nothing to revoke.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async revoke(
    @Param() params: AdminGrantIdParam,
    @Body() body: RevokeSecureGrantBody,
  ): Promise<void> {
    await guardedAdminSupportOperation(() =>
      this.revocation.revoke({ grantId: params.grantId as GrantId, reason: body.reason }),
    );
  }
}
