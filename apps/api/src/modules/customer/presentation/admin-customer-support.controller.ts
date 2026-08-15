/**
 * The three Admin Customer support reads (`APP4-B07`).
 *
 * ```text
 * POST /api/admin/customers/resolve             — adminCustomerSupport_resolve
 * GET  /api/admin/customers/{customerId}        — adminCustomerSupport_detail
 * GET  /api/admin/customers/{customerId}/grants — adminCustomerSupport_grants
 * ```
 *
 * Three, and no fourth. There is still no `GET /api/admin/customers` list and no
 * search: a masked-value list is a customer database with a thin veil, and a
 * partial-match query is an oracle over whether an address belongs to anybody.
 *
 * ### The resolver is the exception, and it is exact
 *
 * B07 originally published no contact lookup at all, on the reasoning that an
 * operator reaches this screen from a ticket that already names the Customer.
 * `APP4-A01` proved that reasoning had no mechanism behind it — no Admin screen
 * anywhere holds a Customer id, and the approved support design asks the
 * operator for an email or a phone — so the Product Owner authorized one narrow
 * resolver in its place.
 *
 * What keeps it from being the search this controller refuses is that it is an
 * *equality* lookup on the normalized value, behind the Admin guard, answering
 * with one id or a 404 that is identical for unknown, unverified, deactivated
 * and malformed input. It cannot enumerate, cannot page and cannot confirm the
 * existence of a value it does not fully match. The argument lives on
 * `AdminCustomerSupportQuery.resolveByContact`.
 *
 * There is still no mutation here — no create, no edit, no contact verify or
 * unverify, no primary rotation, no merge and no anonymization. The class holds
 * one collaborator and it is a query; the resolver's POST is transport, chosen
 * so a contact never lands in a URL, and not a claim that anything is written.
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
  AdminCustomerResolutionResponse,
  type AdminCustomerDetailPayload,
  type AdminCustomerResolutionPayload,
} from './schemas/admin-customer-support.response';
import {
  AdminCustomerGrantsResponse,
  AdminSecureGrantResponse,
  type AdminCustomerGrantsPayload,
} from './schemas/admin-secure-grant.response';
import {
  AdminCustomerIdParam,
  ResolveCustomerByContactBody,
} from './schemas/admin-support.request';

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
  AdminCustomerResolutionResponse,
  AdminSecureGrantResponse,
  AdminCustomerGrantsResponse,
)
export class AdminCustomerSupportController {
  constructor(private readonly support: AdminCustomerSupportQuery) {}

  /**
   * A literal path segment, declared before `:customerId`.
   *
   * `resolve` is not a UUID, so `AdminCustomerIdParam` would refuse it anyway —
   * but the two never collide in the first place, because they differ by method:
   * this is the only POST on `admin/customers`, and the detail read is a GET.
   *
   * ### 200, not 201, and a POST that writes nothing
   *
   * The operation creates no resource; POST is here only to keep a real person's
   * email or phone number out of the request line, where it would reach the
   * gateway access log, the browser history and any `Referer` the page later
   * sends. `StaffOriginGuard` and `StaffJsonBodyGuard` follow the revoke route's
   * precedent — a POST behind a `SameSite=Strict` cookie still gets APP1's CSRF
   * layering, and this one carries a body, so the JSON content-type guard has
   * something to check.
   *
   * `no-store` matters more here than on the reads it feeds: a cached response
   * would associate a contact with a Customer id in a shared proxy.
   */
  @Post('resolve')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOMER_RESOLVED', 'Customer resolved.')
  @ApiOperation({
    summary: 'Resolve a Customer by exact contact',
    description:
      'Turns one exact contact an operator already holds — from a ticket, a request or a ' +
      'conversation — into the Customer id the support reads are addressed by. The contact is ' +
      'normalized by the canonical rules and matched **whole** against verified, current ' +
      'contacts: this is an equality lookup, not a search. There is no partial, prefix or ' +
      'fuzzy match, no result list and no paging, because a verified contact belongs to exactly ' +
      'one Customer. Unknown, unverified, deactivated and malformed inputs all answer 404 ' +
      'alike — the operation tells you which Customer owns a contact you already know, and ' +
      'never whether a contact exists. The submitted value is never echoed, logged or stored.',
  })
  @ApiBody({ type: ResolveCustomerByContactBody })
  @ApiResponse({
    status: 200,
    description: 'The Customer that owns the contact.',
    schema: envelopeSchemaOf(AdminCustomerResolutionResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'No Customer owns a verified, current contact matching the submitted value. The same ' +
      'answer is given when the contact is unverified, deactivated or malformed.',
    schema: ERROR_SCHEMA,
  })
  async resolve(
    @Body() body: ResolveCustomerByContactBody,
  ): Promise<AdminCustomerResolutionPayload> {
    return guardedAdminSupportOperation(async () => ({
      customerId: await this.support.resolveByContact(body.contactKind, body.contact),
    }));
  }

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
    // Omitted rather than null when the Customer never supplied one, matching
    // how every other optional field in this API is serialized.
    ...(view.displayName === undefined ? {} : { displayName: view.displayName }),
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
