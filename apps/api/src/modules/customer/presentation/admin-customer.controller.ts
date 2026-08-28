/**
 * Bounded Admin maintenance of a Customer's profile (`APP10-B01`).
 *
 * ```text
 * PATCH /api/admin/customers/{customerId} — adminCustomer_update
 * ```
 *
 * One operation, and a separate class from `AdminCustomerSupportController`
 * rather than a fourth method on it. Two reasons, and both are about keeping a
 * boundary that already exists:
 *
 * 1. **`APP4-B07` is a read surface, and stays one.** That controller holds a
 *    single collaborator and it is a query; its accepted contract says in so
 *    many words that there is no customer mutation on it. Putting a write there
 *    would not merely add a route — it would make the class that answers "show
 *    me this customer" also the class that changes them, and the next writer
 *    would have no structural reason not to add a second.
 * 2. **The operation id is derived from the class name.** `createOperationId`
 *    turns `AdminCustomerController#update` into `adminCustomer_update`, which
 *    is the published identity `APP10-G01` fixed. Reaching it from the support
 *    class would have meant either `adminCustomerSupport_update` — naming a
 *    write after a support read — or a `CONTROLLER_DOMAIN_KEYS` entry inventing
 *    a domain the file layout does not have.
 *
 * ### It answers 204, and publishes no customer
 *
 * Following `adminSecureGrant_revoke`. The authorized projection of a Customer
 * is `adminCustomerSupport_detail` and there is exactly one of it; republishing
 * that shape from a mutation would create a second place a contact could be
 * rendered, and a second place to keep in step with the masking rule. The
 * client re-reads the detail, which it must do anyway to see the contacts this
 * operation does not touch.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard`, plus `StaffOriginGuard` and `StaffJsonBodyGuard`
 * on the mutation — the exact three the revoke route uses. This controller
 * parses no cookie, looks up no session, accepts no caller-supplied Admin id
 * and defines no guard of its own. There is no role check because there is no
 * role model: APP1-B01 is a binary authenticated-admin gate, and inventing a
 * permission matrix here would be a security model with no authority behind it.
 */
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
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
import { MaintainCustomerProfile } from '../application/maintain-customer-profile.use-case';
import { guardedCustomerMaintenance } from '../domain/maintenance/customer-maintenance.errors';
import { ADMIN_SUPPORT_CACHE_CONTROL } from '../domain/support/admin-support.policy';
import type { CustomerId } from '../domain/repositories/customer.repository';
import { UpdateCustomerProfileBody } from './schemas/admin-customer-maintenance.request';
import { AdminCustomerIdParam } from './schemas/admin-support.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminCustomer')
@ApiCookieAuth('adminSession')
@Controller('admin/customers')
@UseGuards(AuthenticatedAdminGuard)
export class AdminCustomerController {
  constructor(private readonly profile: MaintainCustomerProfile) {}

  @Patch(':customerId')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  // `no-store` on a 204 that carries nothing is not redundant: it is the
  // established treatment for every response on this Customer surface, and the
  // rule is easier to keep than to remember exceptions to.
  @Header('Cache-Control', ADMIN_SUPPORT_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Update a Customer’s profile metadata',
    description:
      'Patches the two profile fields an operator maintains — `displayName` and `notes` — and ' +
      'nothing else. Verification evidence, merge state, anonymization and every contact are ' +
      'unreachable from this operation: it cannot create a contact, change a contact value, or ' +
      'write or clear a verification instant. An omitted field is left unchanged; `null` or a ' +
      'blank string clears it. A patch whose values already match writes nothing and appends no ' +
      'audit event. A Customer already merged into another can no longer be maintained.',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiBody({ type: UpdateCustomerProfileBody })
  @ApiResponse({ status: 204, description: 'The profile is up to date. No content.' })
  @ApiResponse({
    status: 400,
    description: 'Malformed customer id, an unknown field, an over-long value, or an empty patch.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such Customer.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The Customer has been merged into another and can no longer be maintained.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'The body is not application/json.',
    schema: ERROR_SCHEMA,
  })
  async update(
    @Param() params: AdminCustomerIdParam,
    @Body() body: UpdateCustomerProfileBody,
  ): Promise<void> {
    await guardedCustomerMaintenance(() =>
      this.profile.update({
        customerId: params.customerId as CustomerId,
        // The clearing contract (§ the request schema), applied once here:
        //   absent         -> omitted, so the use case leaves it alone
        //   null or blank  -> null, so the use case clears the column
        //   any other text -> stored
        ...(body.displayName === undefined ? {} : { displayName: cleared(body.displayName) }),
        ...(body.notes === undefined ? {} : { notes: cleared(body.notes) }),
      }),
    );
  }
}

/** Blank is a clear, not a value. See {@link UpdateCustomerProfileBody}. */
function cleared(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value;
}
