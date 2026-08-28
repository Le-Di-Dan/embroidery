/**
 * The two Admin contact-maintenance mutations (`APP10-B01`).
 *
 * ```text
 * POST /api/admin/customers/{customerId}/contacts/{contactId}/primary
 *      — adminCustomerContact_promote
 * POST /api/admin/customers/{customerId}/contacts/{contactId}/deactivate
 *      — adminCustomerContact_deactivate
 * ```
 *
 * Two, and no third. There is deliberately **no** contact-create route here,
 * and no route that could edit a contact value or its verification instant. A
 * Customer identity *is* possession of a verified channel (ADR-DB2-001 r3), and
 * an Admin endpoint that minted or rewrote that evidence would replace a proof
 * with a staff session. Adding a channel remains the verification challenge's
 * job (LC-02). These two operations are exactly the ones that need no new
 * evidence: choosing which existing verified contact is primary, and retiring
 * one.
 *
 * There is also no contact **read** here. The one authorized projection of a
 * Customer's contacts is `adminCustomerSupport_detail`, which publishes them
 * masked and only masked; `APP10-B01` adds an opaque `contactId` to it so these
 * two routes are addressable, and adds nothing else. A contact-detail endpoint
 * would be a second place a contact could be rendered and a second place to
 * keep the masking rule in step with.
 *
 * ### POST, and 204
 *
 * POST rather than PATCH because neither is a partial update of a
 * representation: each is a named transition on a contact, with its own
 * preconditions, and `POST .../primary` reads as the act it is. The pair
 * follows `adminSecureGrant_revoke` — the established shape for an Admin
 * transition in this codebase — including its 204: nothing is published back,
 * so no contact value has anywhere to appear.
 *
 * Both carry `StaffOriginGuard` beside the Admin guard, and deliberately
 * **not** `StaffJsonBodyGuard`. That guard requires `application/json` and
 * exists to stop a cross-site HTML form post reaching a route that reads a
 * body; these two read no body, so it would only oblige every client to state a
 * content type for a request that has no content. This is the shape
 * `adminOrder_dispatch` already uses for a bodyless Admin transition, and the
 * reason APP1 applies the JSON guard to login but not to logout. The CSRF
 * protection that matters here — a `SameSite=Strict` session cookie plus the
 * origin allowlist — is unchanged.
 *
 * ### A foreign contact id is a 404
 *
 * Identical to an id that names nothing. An operator holding a contact id from
 * one Customer must not be able to learn, by pointing it at another, that the
 * id is real — the enumeration refusal `ADR-APP4-001` §3 makes for contact
 * values, applied to the identifiers that address them. The mechanism is in the
 * use case: contacts are loaded by customer, never by contact id alone, so a
 * foreign row is never read and then reasoned about.
 */
import { Controller, Header, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { MaintainCustomerContact } from '../application/maintain-customer-contact.use-case';
import { guardedCustomerMaintenance } from '../domain/maintenance/customer-maintenance.errors';
import { ADMIN_SUPPORT_CACHE_CONTROL } from '../domain/support/admin-support.policy';
import type { ContactPointId, CustomerId } from '../domain/repositories/customer.repository';
import { AdminCustomerContactParams } from './schemas/admin-customer-maintenance.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const NOT_FOUND_DESCRIPTION =
  'No such Customer, or this Customer has no such contact. A contact id belonging to another ' +
  'Customer is answered exactly the same way as one that names nothing.';

@ApiTags('adminCustomerContact')
@ApiCookieAuth('adminSession')
@Controller('admin/customers/:customerId/contacts')
@UseGuards(AuthenticatedAdminGuard, StaffOriginGuard)
export class AdminCustomerContactController {
  constructor(private readonly contacts: MaintainCustomerContact) {}

  @Post(':contactId/primary')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Make a contact the primary one',
    description:
      'Moves the primary designation to a contact that already belongs to this Customer, is ' +
      'active and is **already verified**. The rotation is atomic: the previous primary is ' +
      'cleared and this one set inside one transaction, arbitrated by the one-primary-per-' +
      'Customer unique index. The contact value is never rewritten, no verification instant is ' +
      'written or cleared, and no contact is created. Promoting the contact that is already ' +
      'primary succeeds and changes nothing — no write, no audit event.',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiParam({ name: 'contactId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'That contact is the primary one. No content.' })
  @ApiResponse({ status: 400, description: 'A malformed id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The Customer has been merged into another, or the contact is deactivated or not ' +
      'verified. An unverified contact becomes promotable through the verification flow, ' +
      'never through this operation.',
    schema: ERROR_SCHEMA,
  })
  async promote(@Param() params: AdminCustomerContactParams): Promise<void> {
    await guardedCustomerMaintenance(() => this.contacts.promote(commandOf(params)));
  }

  @Post(':contactId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Deactivate a contact',
    description:
      'Retires a contact of this Customer. Soft and never destructive: the row stays, its ' +
      'value and its verification instant are left exactly as they are, and only the ' +
      'deactivation instant is written — which is what releases it from the verified-contact ' +
      'uniqueness rule. The primary contact cannot be deactivated, and neither can the ' +
      'Customer’s last verified one; promote a replacement first, explicitly. Nothing is ' +
      'promoted as a side effect. Deactivating a contact that is already deactivated succeeds ' +
      'and changes nothing — no write, no audit event.',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiParam({ name: 'contactId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'That contact is deactivated. No content.' })
  @ApiResponse({ status: 400, description: 'A malformed id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      'The Customer has been merged into another, or the contact is the primary one or the ' +
      'last verified one.',
    schema: ERROR_SCHEMA,
  })
  async deactivate(@Param() params: AdminCustomerContactParams): Promise<void> {
    await guardedCustomerMaintenance(() => this.contacts.deactivate(commandOf(params)));
  }
}

function commandOf(params: AdminCustomerContactParams): {
  readonly customerId: CustomerId;
  readonly contactPointId: ContactPointId;
} {
  return {
    customerId: params.customerId as CustomerId,
    contactPointId: params.contactId as ContactPointId,
  };
}
