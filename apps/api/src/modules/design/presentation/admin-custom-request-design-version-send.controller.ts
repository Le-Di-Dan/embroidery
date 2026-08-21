/**
 * The one Admin design-version send mutation (`APP6-B09`).
 *
 * ```text
 * POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send
 *   — adminCustomRequestDesignVersion_send
 * ```
 *
 * One, and no second. There is no `/resend`: re-issuing the same version is the
 * *same* command and replays through this route, and a separate verb would be a
 * second way to express one intent whose two implementations would drift. There
 * is no `/review-ready`, no `/design-review`, no `/current/send` shortcut and no
 * generic status mutation — a send addresses the exact version being frozen, so
 * the operator's URL states which design went to the customer.
 *
 * ### The command is a send, not a status
 *
 * `APP6-G01` §4.1 and LC-11 `TR-LC11-08` reach `DESIGN_REVIEW` **only** as a
 * projection of the committed design send. This publishes no transition target,
 * no `POST /custom-requests/{id}/design-review`, and no body through which one
 * could be named: `DESIGN_REVIEW` appears in the response as a *reported* state
 * and nowhere as an input. `APP5-B05`/`B06`'s Admin transition allow-list is
 * untouched by this checkpoint.
 *
 * ### A separate controller from `APP6-B08`'s
 *
 * B08's class states in its own contract test that it exposes exactly two
 * handlers, and its module deliberately holds no order write repository and no
 * outbox — which is what lets that suite say an authoring route cannot move a
 * request. The send needs both, so it composes its own module around the same
 * AGG-10 port, and `CONTROLLER_DOMAIN_KEYS` keeps the three operations one
 * published domain: `adminCustomRequestDesignVersion_create`, `_list`, `_send`.
 * Neither accepted B08 id is reissued by the split.
 *
 * ### Guards match what the verb does
 *
 * `AuthenticatedAdminGuard` at controller level and `StaffOriginGuard` on the
 * handler — the CSRF-shaped origin check every Admin mutation in this repository
 * carries. `StaffJsonBodyGuard` is **absent**, and deliberately: this operation
 * has no body, so there is no content type to check and requiring
 * `application/json` would reject a perfectly legitimate bodyless POST. It is
 * the accepted `APP6-B03` send precedent, for the same reason.
 *
 * ### It renders nothing and issues nothing
 *
 * No raster, no derivative, no preview, no export and no download: review
 * rendering stays the safe formal document drawn by the APP3 native-SVG renderer
 * under the APP3-S09 runtime watermark, on the Storefront surface `APP6-B10`/
 * `S02` own. No grant is issued, reissued or read here, and no customer identity
 * is accepted — B10 uses the existing `REQUEST_ACCESS` architecture unchanged.
 */
import { Controller, Header, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
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
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { SendDesignVersionUseCase } from '../application/sending/send-design-version.use-case';
import type { DesignVersionSentView } from '../application/sending/design-version-sent.view';
import { guardedDesignVersionSend } from '../domain/design-version-send.errors';
import type { DesignVersionId } from '../domain/repositories/design-case.repository';
import { DesignVersionSendParams } from './schemas/admin-design-version-send.request';
import {
  DesignVersionSentResponse,
  type DesignVersionSentPayload,
} from './schemas/admin-design-version-send.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Customer-private design evidence must never be cached by a shared proxy. */
const DESIGN_VERSION_CACHE_CONTROL = 'no-store';

@ApiTags('adminCustomRequestDesignVersion')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries a
// dangling `$ref` the generated client cannot name.
@ApiExtraModels(DesignVersionSentResponse)
export class AdminCustomRequestDesignVersionSendController {
  constructor(private readonly sender: SendDesignVersionUseCase) {}

  /** 200 — the version is frozen, hashed, and the customer's review is open. */
  @Post(':requestId/design-versions/:versionId/send')
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', DESIGN_VERSION_CACHE_CONTROL)
  @ApiSuccessCode('DESIGN_VERSION_SENT', 'Design version sent for review.')
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiOperation({
    summary: 'Send one exact design version to the customer for review',
    description:
      'Freezes the version named by `versionId` — **that** version, never the latest one — and ' +
      'opens the customer’s review of it (`TR-LC08-02`). One transaction does all of it: the ' +
      'stored design document is canonicalized and hashed, the version becomes ' +
      '`SENT_FOR_REVIEW` with that hash and a send instant, any revision-requested predecessor ' +
      'becomes `SUPERSEDED`, and a request that was `DIGITIZING` moves to `DESIGN_REVIEW`. ' +
      'Nothing partial survives a failure.\n\n' +
      'There is no request body. The document is read from the version — never supplied — and ' +
      'no caller-provided hash is accepted anywhere. The placement, the branch and the geometry ' +
      'the version was drafted against are re-established before anything is frozen, and a ' +
      'placement that has moved refuses the send rather than being substituted.\n\n' +
      'Only one version of a design case may await review at a time. Sending a second one while ' +
      'a review is open is refused with `REVIEW_ALREADY_ACTIVE`; the open review is never ' +
      'cleared to make room for it. Sending the **same** version again is safe and is the ' +
      'intended way to re-issue it: the call replays, returning the committed result without ' +
      're-hashing it, moving the instant, superseding anything again, moving the request or ' +
      'notifying the customer a second time.\n\n' +
      'Nothing is rendered: no preview image is produced, stored or returned, and no secure ' +
      'link or token is issued here.',
  })
  @ApiResponse({
    status: 200,
    description: 'The frozen version, its hash, and where the request now stands.',
    schema: envelopeSchemaOf(DesignVersionSentResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed identifier.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      '`REQUEST_NOT_FOUND` — no such custom request. `DESIGN_VERSION_NOT_FOUND` — this ' +
      'request’s design case has no version with that id; a version belonging to another ' +
      'request gets the same answer.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      '`REVIEW_ALREADY_ACTIVE` — another version of this design is already awaiting review. ' +
      '`DESIGN_VERSION_NOT_SENDABLE` — the version is not a draft. ' +
      '`DESIGN_VERSION_NOT_CURRENT` — the draft is not the design case’s current version. ' +
      '`REQUEST_NOT_SENDABLE` — the request is not being digitized or reviewed. ' +
      '`REQUEST_TRANSITION_STALE` — the request changed state first; nothing was written. ' +
      '`DESIGN_CASE_UNRESOLVED` / `PLACEMENT_AUTHORITY_UNRESOLVED` / ' +
      '`PLACEMENT_FROZEN_MISMATCH` — the case or the placement no longer resolves to what this ' +
      'version was drafted against, and nothing was substituted.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 422,
    description: 'The stored design document was rejected and cannot be frozen.',
    schema: ERROR_SCHEMA,
  })
  async send(@Param() params: DesignVersionSendParams): Promise<DesignVersionSentPayload> {
    return guardedDesignVersionSend(async () => {
      const view = await this.sender.send({
        customRequestId: params.requestId as CustomRequestId,
        versionId: params.versionId as DesignVersionId,
      });
      return { sent: toSentResponse(view) };
    });
  }
}

/**
 * Written field by field rather than spread, the rule `APP5-B04`, `APP6-B07` and
 * `APP6-B08` all follow: the view type has nowhere to put a property it gains
 * later, so a grant, a preview or an Approval Snapshot added for `APP6-B10`/
 * `B11` cannot reach this response by accident. `Date` becomes an ISO-8601
 * string; nothing else is converted.
 */
function toSentResponse(view: DesignVersionSentView): DesignVersionSentResponse {
  return {
    requestId: view.requestId,
    designCaseId: view.designCaseId,
    versionId: view.versionId,
    version: view.version,
    versionStatus: view.versionStatus,
    requestStatus: view.requestStatus,
    requestTransitioned: view.requestTransitioned,
    branch: view.branch,
    documentSchemaVersion: view.documentSchemaVersion,
    documentHash: view.documentHash,
    sentAt: view.sentAt.toISOString(),
    supersededVersionIds: [...view.supersededVersionIds],
    replayed: view.replayed,
  };
}
