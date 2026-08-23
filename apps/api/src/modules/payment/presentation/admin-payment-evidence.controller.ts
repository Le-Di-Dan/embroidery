/**
 * The one private Admin transfer-evidence delivery operation (`APP7-B06`).
 *
 * ```text
 * GET /api/admin/payment-evidence/:evidenceId/content — adminPaymentEvidence_get
 * ```
 *
 * One operation on one contextual address. There is no
 * `GET /api/admin/assets/{assetId}/content`, and adding one would replace a
 * conjunctive association proof with a single existence check. `APP7-B04`
 * already owns the evidence *metadata* — `evidenceId`, `assetStatus`,
 * `mediaType`, `byteSize`, `createdAt`, `previewEligible` — and publishes no
 * asset id and no key; this publishes the bytes and still neither.
 *
 * ## Why the association id and not the attempt
 *
 * `APP7-B04` deliberately publishes `payment_transfer_evidence.id` rather than
 * `asset_id`, so the address a browser can construct is one that means "the
 * image this attempt carries" rather than "this file". A route nested under the
 * attempt (`/payment-attempts/{attemptId}/evidence/{id}`) would add a segment
 * that authorizes nothing the association id does not already decide, and would
 * make an operator's URL depend on two ids where one suffices.
 *
 * ## Why this is a separate class from the B04 read and the two mutations
 *
 * `AdminOrderPaymentController` returns a JSON envelope and
 * `AdminPaymentAttemptController` writes money state; this returns a byte stream
 * with its own headers, its own error vocabulary and its own
 * `@Res({ passthrough: true })` plumbing. Its module is also the only Payment
 * Admin module holding an object store, which is exactly the containment
 * `AdminOrderPaymentModule` documents itself by.
 *
 * The split is a **new domain**, not a rename. `adminPaymentEvidence` derives
 * from this class name with no `CONTROLLER_DOMAIN_KEYS` entry, exactly as
 * `AdminCustomRequestAssetController` does for the APP5 attachment lane: a
 * private binary surface is its own published domain rather than a split of the
 * order-payment domain, so B04's three and B05's two accepted operation ids are
 * untouched.
 *
 * ## What the controller decides
 *
 * Nothing about access. It owns HTTP and the response stream; which bytes a
 * caller may see is decided by `AuthenticatedAdminGuard` and then, behind the
 * service boundary, against the database — on every single request.
 */
import { Controller, Get, Param, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';

import { ENVELOPE_SCHEMA_NAMES } from '../../../openapi/envelope-schema.augmentation';
import {
  watchClientDisconnect,
  type HeaderSettableResponse,
} from '../../../platform/http-response/client-disconnect';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { DeliverTransferEvidence } from '../application/admin/deliver-transfer-evidence.use-case';
import {
  EVIDENCE_CACHE_CONTROL,
  EVIDENCE_CONTENT_DISPOSITION,
  EVIDENCE_CONTENT_TYPE_OPTIONS,
  EVIDENCE_MEDIA_TYPES,
} from '../domain/evidence/evidence-delivery.policy';
import {
  isPaymentEvidenceDeliveryError,
  toHttpException,
} from '../domain/evidence/evidence-delivery.errors';
import { AdminPaymentEvidenceParam } from './schemas/admin-payment-evidence.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/**
 * The deliverable types, documented as the only alternatives there are.
 *
 * Built from the policy allowlist rather than written out, so the published
 * contract cannot claim a type the delivery path would refuse to stream.
 */
const DELIVERABLE_CONTENT = Object.fromEntries(
  EVIDENCE_MEDIA_TYPES.map((type) => [type, { schema: { type: 'string', format: 'binary' } }]),
);

@ApiTags('adminPaymentEvidence')
@ApiCookieAuth('adminSession')
@Controller('admin/payment-evidence')
@UseGuards(AuthenticatedAdminGuard)
export class AdminPaymentEvidenceController {
  constructor(private readonly delivery: DeliverTransferEvidence) {}

  @Get(':evidenceId/content')
  @ApiOperation({
    summary: 'Open one transfer screenshot submitted against a deposit',
    description:
      'Streams the validated image a customer submitted as evidence of their deposit transfer. ' +
      'Private: the Admin session cookie is verified on every request, and the evidence id ' +
      'grants nothing on its own. The address is the payment evidence association — there is no ' +
      'route that serves an asset by its own id, so an id lifted from anywhere else cannot be ' +
      'read here. The association, the payment attempt it names, the upload lane, the ' +
      'inspection verdict and the tombstone are re-checked on every request; only evidence ' +
      'APP7-B04 reports as previewEligible is served. What is served is the ' +
      'inspection-approved source the customer uploaded: APP7 produces no normalized ' +
      'derivative of transfer evidence, and none is generated here. No storage location, ' +
      'provider address, bank configuration or credential of any kind appears in the response, ' +
      'and there is no parameter that could ask for one. Opening evidence changes no payment ' +
      'truth: no attempt or obligation moves, no order transitions, no reconciliation is ' +
      'appended and the Admin session is not rotated — APP7-B04 remains the only verification ' +
      'authority. Responses are never cached: the bytes are immutable but the authorisation ' +
      'around them is not.',
  })
  @ApiParam({
    name: 'evidenceId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description:
      'An evidence id from the order payment read. It names no stored object and grants no ' +
      'access on its own.',
  })
  @ApiProduces(...EVIDENCE_MEDIA_TYPES)
  @ApiResponse({
    status: 200,
    description:
      'The submitted screenshot: the validated, inspection-approved bytes the customer uploaded.',
    content: DELIVERABLE_CONTENT,
    headers: {
      'Cache-Control': {
        description:
          'Always `private, no-store`. The bytes are immutable but the session authorising them ' +
          'is not.',
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': { description: 'Always `nosniff`.', schema: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed evidence id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      'No transfer evidence is available at this address. Returned identically for an unknown ' +
      'evidence id, an association whose payment attempt does not resolve, an image outside the ' +
      'customer-private upload lane, a tombstoned one, one still awaiting or undergoing ' +
      'inspection, one that inspection rejected, and one whose stored source is incompletely ' +
      'described or of an undeliverable type.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Evidence storage is temporarily unavailable, or the stored object contradicts the ' +
      'recorded size.',
    schema: ERROR_SCHEMA,
  })
  async get(
    @Param() params: AdminPaymentEvidenceParam,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<StreamableFile> {
    const abort = watchClientDisconnect(request, response);

    let stream;
    try {
      stream = await this.delivery.open(params.evidenceId, abort.signal);
    } catch (error: unknown) {
      throw isPaymentEvidenceDeliveryError(error) ? toHttpException(error) : error;
    }

    // From here the body is open, so a disconnect must tear it down rather than
    // leave the provider connection draining into a socket nobody is reading.
    abort.signal.addEventListener('abort', () => stream.body.destroy(), { once: true });

    response.setHeader('Cache-Control', EVIDENCE_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', EVIDENCE_CONTENT_TYPE_OPTIONS);

    return new StreamableFile(stream.body, {
      type: stream.contentType,
      // No `filename` parameter: the original upload name is never persisted, and
      // inventing one would describe the object falsely.
      disposition: EVIDENCE_CONTENT_DISPOSITION,
      // Always present: the service refuses to stream at all unless the provider
      // count and the persisted `size_bytes` agree.
      length: stream.contentLengthBytes,
    });
  }
}
