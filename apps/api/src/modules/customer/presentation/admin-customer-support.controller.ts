/**
 * The two Admin Customer support reads (`APP4-B07`).
 *
 * ```text
 * GET /api/admin/customers/{customerId}         — adminCustomerSupport_detail
 * GET /api/admin/customers/{customerId}/grants  — adminCustomerSupport_grants
 * ```
 *
 * Two, and no third. There is no `GET /api/admin/customers` list, no search by
 * email or phone, and no lookup by contact value. That is not a deferral: a
 * contact-value lookup is the one query that turns a support screen into an
 * oracle over whether a given address or number belongs to anybody, and a
 * masked-value list is a customer database with a thin veil. An operator reaches
 * this screen from a request, a ticket or a notification that already names the
 * Customer.
 *
 * There is also no mutation here — no create, no edit, no contact verify or
 * unverify, no primary rotation, no merge and no anonymization. The class holds
 * one collaborator and it is a query.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` is the exact guard `GET /api/staff/me` and every
 * Admin catalogue and template route already use. This controller parses no
 * cookie, looks up no session, accepts no caller-supplied Admin id and defines
 * no guard of its own. There is no role check because there is no role model:
 * APP1-B01 is a binary authenticated-admin gate, and inventing a permission
 * matrix here would be a security model with no authority behind it.
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
import {
  AdminCustomerSupportQuery,
  type AdminCustomerDetailView,
  type AdminGrantView,
} from '../application/admin-customer-support.query';
import { guardedAdminSupportOperation } from '../domain/support/admin-support.errors';
import { ADMIN_SUPPORT_CACHE_CONTROL } from '../domain/support/admin-support.policy';
import type { CustomerId } from '../domain/repositories/customer.repository';
import {
  AdminCustomerContactResponse,
  AdminCustomerDetailResponse,
  type AdminCustomerDetailPayload,
} from './schemas/admin-customer-support.response';
import {
  AdminCustomerGrantsResponse,
  AdminSecureGrantResponse,
  type AdminCustomerGrantsPayload,
} from './schemas/admin-secure-grant.response';
import { AdminCustomerIdParam } from './schemas/admin-support.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminCustomerSupport')
@ApiCookieAuth('adminSession')
@Controller('admin/customers')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminCustomerContactResponse,
  AdminCustomerDetailResponse,
  AdminSecureGrantResponse,
  AdminCustomerGrantsResponse,
)
export class AdminCustomerSupportController {
  constructor(private readonly support: AdminCustomerSupportQuery) {}

  @Get(':customerId')
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_READ', 'Customer retrieved.')
  @ApiOperation({
    summary: 'Get one Customer for support',
    description:
      'The minimum an operator needs to answer "is this Customer verified, which contacts are ' +
      'current, and which one is primary". Contacts are returned masked and only masked — the ' +
      'raw, normalized and display values are never published. Deactivated historical contacts ' +
      'are not listed, and there is no Business Profile, merge history or credential data in ' +
      'the response. This is a read: it changes nothing and writes no audit event.',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The Customer and their current, masked contacts.',
    schema: envelopeSchemaOf(AdminCustomerDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed customer id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such Customer.', schema: ERROR_SCHEMA })
  async detail(@Param() params: AdminCustomerIdParam): Promise<AdminCustomerDetailPayload> {
    return guardedAdminSupportOperation(async () =>
      toDetailPayload(await this.support.detail(params.customerId as CustomerId)),
    );
  }

  @Get(':customerId/grants')
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_GRANTS_READ', 'Customer grants retrieved.')
  @ApiOperation({
    summary: 'List one Customer’s secure grants',
    description:
      'Every secure grant belonging to this Customer, newest first, whatever its state — a ' +
      'revoked or expired grant is what explains a link that stopped working. Scoped to the ' +
      'Customer in the path: there is no global or cross-Customer grant listing. The response ' +
      'carries no token, no token hash, no recipient and no notification data. Read `status` ' +
      'together with `expiresAt`: expiry is enforced on use rather than by a sweep, so a grant ' +
      'stored as ACTIVE past its `expiresAt` is not live.',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The Customer’s grants.',
    schema: envelopeSchemaOf(AdminCustomerGrantsResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed customer id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such Customer.', schema: ERROR_SCHEMA })
  async grants(@Param() params: AdminCustomerIdParam): Promise<AdminCustomerGrantsPayload> {
    return guardedAdminSupportOperation(async () =>
      toGrantsPayload(await this.support.grants(params.customerId as CustomerId)),
    );
  }
}

/**
 * The detail projection.
 *
 * A function whose return type has nowhere to put a normalized value, a display
 * value, a contact-point id or a merge pointer, so no later edit to the view can
 * leak one without also changing this function.
 */
function toDetailPayload(view: AdminCustomerDetailView): AdminCustomerDetailPayload {
  return {
    customerId: view.customerId,
    verifiedAt: view.verifiedAt.toISOString(),
    contacts: view.contacts.map((contact) => ({
      kind: contact.kind,
      maskedValue: contact.maskedValue,
      verified: contact.verified,
      primary: contact.primary,
    })),
  };
}

/** The grants projection. Same rule: the digest has nowhere to land. */
function toGrantsPayload(grants: readonly AdminGrantView[]): AdminCustomerGrantsPayload {
  return {
    grants: grants.map((grant) => ({
      grantId: grant.id,
      customRequestId: grant.customRequestId,
      scopeKind: grant.scopeKind,
      status: grant.status,
      expiresAt: grant.expiresAt.toISOString(),
    })),
  };
}
