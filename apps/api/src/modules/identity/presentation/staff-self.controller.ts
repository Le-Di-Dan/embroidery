/**
 * Current-staff endpoint (APP1-B02): the authenticated Admin shell's identity.
 *
 *   GET /api/staff/me — current staff (staffSelf_get)
 *
 * It reuses the B01 `AuthenticatedAdminGuard` for the entire session lifecycle
 * — resolution, sliding renewal, revocation and account-status checks — so this
 * controller performs no authentication of its own: no cookie parsing, no token
 * hashing, no second repository lookup. The guard attaches the resolved
 * projection; `@CurrentStaff()` reads it and the query maps it to the public
 * view. A routine read binds no new audit event and never rewrites the cookie.
 */
import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import {
  GetCurrentStaffQuery,
  type CurrentStaffView,
} from '../application/get-current-staff.query';
import { CurrentStaff } from './current-staff.decorator';
import { AuthenticatedAdminGuard } from './guards/authenticated-admin.guard';
import { CurrentStaffResponse } from './schemas/current-staff.response';
import type { ResolvedStaffSession } from '../application/resolve-staff-session.service';

@ApiTags('staff')
@Controller('staff/me')
export class StaffSelfController {
  constructor(private readonly query: GetCurrentStaffQuery) {}

  @Get()
  @UseGuards(AuthenticatedAdminGuard)
  // An authenticated identity must never be cached by a shared or private cache.
  @Header('Cache-Control', 'no-store')
  @ApiSuccessCode('STAFF_SELF_READ', 'Current staff retrieved.')
  @ApiCookieAuth('adminSession')
  @ApiOperation({
    summary: 'Get the current staff identity',
    description:
      'Returns the minimum safe identity for the authenticated admin: id, email ' +
      'and display name. No credential, session or role data is exposed.',
  })
  @ApiExtraModels(CurrentStaffResponse)
  @ApiOkResponse({
    description: 'The authenticated admin identity for the shell.',
    schema: {
      allOf: [
        { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
        { properties: { data: { $ref: getSchemaPath(CurrentStaffResponse) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'No live admin session (missing, invalid, expired, revoked or disabled).',
    schema: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` },
  })
  get(@CurrentStaff() session: ResolvedStaffSession): CurrentStaffView {
    // The guard admitted only a resolved session; map it and return. The
    // interceptor wraps the result in the canonical success envelope.
    return this.query.execute(session);
  }
}
