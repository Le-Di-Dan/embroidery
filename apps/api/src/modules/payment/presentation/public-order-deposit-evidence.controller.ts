/**
 * The two customer transfer-evidence operations (`APP7-B05` §1, §4, §19).
 *
 * ```text
 * POST /api/public/orders/deposit/evidence         — publicOrderDepositEvidence_upload
 * POST /api/public/orders/deposit/evidence/status  — publicOrderDepositEvidence_status
 * ```
 *
 * Two, and no third. The upload response is necessarily written before the
 * inspector has run, so without the status read a customer's screen could only
 * say "sent" forever or guess. There is **no** delete, no replace, no detach, no
 * reorder and no content route: evidence is append-only (`APP7-G01` §7.2), and
 * Admin binary preview is `APP7-B06`'s, `ACCEPTED`-only and Admin-only.
 *
 * ### Its own published domain
 *
 * `publicOrderDepositEvidence`, derived from this class name, and deliberately
 * **not** folded into `publicOrderDeposit` through `CONTROLLER_DOMAIN_KEYS`. The
 * intake lane is its own domain on the precedent that table already records for
 * `PublicCustomRequestAssetController`: a streaming upload with storage
 * ownership, its own idempotency namespace, a media-signature policy and a
 * per-attempt bound is not a split of the deposit read.
 *
 * ### Both are POST, and the second one writes nothing
 *
 * `ADR-APP4-001` §11 makes the secure-link token a body-only carrier with no
 * path, query or header fallback, so a `GET …/status?token=…` would put a live
 * credential into every access log between the browser and the process. The
 * status operation is idempotent and zero-write despite the verb, exactly as
 * `APP7-B03`'s deposit read and QR download are.
 *
 * ### Why there is no guard
 *
 * The credential is the token and it is re-read, digested and re-established
 * under the grant's row lock inside the transaction that acts on it. A guard
 * could only read it earlier, outside that transaction, and would then have to
 * be trusted by the code that binds the association — `APP7-B03` records the
 * same reasoning for the same reason.
 *
 * ### One class, two very different bodies
 *
 * The upload takes the raw request, because binding a `@Body()` would make Nest
 * buffer ten megabytes in memory before the handler ran — precisely what the
 * streaming design exists to avoid. The status read takes a validated DTO. They
 * stay together because they are one small published domain over one resource,
 * and because splitting them would mint a second domain key for a file-layout
 * decision.
 *
 * ### Which failures look the same, and which do not
 *
 * Every unusable token, every unreachable deposit and every attempt that is not
 * this customer's arrives as one `SecureLinkError` and leaves as one
 * `404 / SECURE_LINK_UNAVAILABLE`. `REVERIFICATION_REQUIRED`,
 * `EVIDENCE_QUOTA_REACHED` and `EVIDENCE_ATTEMPT_CLOSED` are deliberately not
 * folded into it: each is reachable only after the caller has proved possession
 * of a live grant for this request, so none discloses anything a probe did not
 * already hold — and collapsing them would leave the customer's screen unable to
 * tell "confirm your contact again" from "you have sent the maximum" from "this
 * attempt is finished; start a new one".
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import {
  isAssetIntakeError,
  toHttpException as toAssetIntakeHttpException,
} from '../../asset/domain/asset-intake.errors';
import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
} from '../../asset/domain/idempotency-key';
import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../customer/application/authorize-secure-link.service';
import {
  isSecureLinkError,
  toSecureLinkHttpException,
} from '../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../customer/infrastructure/rate-limit/public-network-key.service';
import { ReadTransferEvidence } from '../application/evidence/read-transfer-evidence.query';
import { UploadTransferEvidenceService } from '../application/evidence/upload-transfer-evidence.service';
import type {
  TransferEvidenceListView,
  TransferEvidenceUploadView,
} from '../application/evidence/transfer-evidence.view';
import { isDepositError, toDepositHttpException } from '../domain/deposit/deposit.errors';
import {
  isTransferEvidenceError,
  toTransferEvidenceHttpException,
} from '../domain/evidence/transfer-evidence.errors';
import {
  MAX_EVIDENCE_PER_ATTEMPT,
  MAX_TRANSFER_EVIDENCE_BYTES,
} from '../domain/evidence/transfer-evidence.policy';
import {
  ReadTransferEvidenceBody,
  readTransferEvidenceSchema,
  transferEvidenceMultipartSchema,
} from './schemas/public-order-deposit-evidence.request';
import {
  TransferEvidenceItemResponse,
  TransferEvidenceListResponse,
  TransferEvidenceUploadResponse,
} from './schemas/public-order-deposit-evidence.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** The response fields this controller writes; structural to avoid an HTTP import. */
interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
}

@ApiTags('publicOrderDepositEvidence')
@ApiExtraModels(
  TransferEvidenceUploadResponse,
  TransferEvidenceListResponse,
  TransferEvidenceItemResponse,
)
@Controller('public/orders/deposit/evidence')
export class PublicOrderDepositEvidenceController {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly uploads: UploadTransferEvidenceService,
    private readonly reader: ReadTransferEvidence,
    private readonly clock: AuditClock,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiSuccessCode('TRANSFER_EVIDENCE_ACCEPTED', 'Transfer image accepted for inspection.')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit one transfer image for one bank-transfer attempt',
    description:
      'Streams a single PNG, JPEG or WebP image of at most ' +
      `${MAX_TRANSFER_EVIDENCE_BYTES} bytes into private storage, records it against the ` +
      'named bank-transfer attempt and queues inspection. Transfer evidence is **optional** ' +
      'and supporting only: it helps the workshop reconcile the payment faster, and a ' +
      'correct transfer with no image at all is verified in exactly the same way. It ' +
      'changes nothing — no attempt is settled, no deposit is satisfied, no order becomes ' +
      'DEPOSIT_PAID and no verification is recorded. The order, the deposit, the customer ' +
      'and the step-up evidence are all resolved by the server from the secure link; the ' +
      'attempt id names which attempt the image belongs to and is proved against that link ' +
      'before a byte is read. Append-only: at most ' +
      `${MAX_EVIDENCE_PER_ATTEMPT} images per attempt, and none can be deleted or replaced. ` +
      'A retry opens a new attempt with an evidence set of its own. Idempotent: repeating ' +
      'the request with the same Idempotency-Key and the same file returns the original ' +
      'result and writes no second image, submission or inspection.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      `The caller’s own key for this upload, ${String(MIN_IDEMPOTENCY_KEY_LENGTH)}–` +
      `${String(MAX_IDEMPOTENCY_KEY_LENGTH)} characters from A–Z a–z 0–9 . _ : and -. ` +
      'Never stored in the clear and never echoed back.',
    schema: { type: 'string' },
  })
  @ApiBody({ schema: transferEvidenceMultipartSchema() })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'The image is stored, recorded against the attempt and queued for inspection.',
    schema: envelopeSchemaOf(TransferEvidenceUploadResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed multipart body, or a missing or malformed Idempotency-Key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description:
      'REVERIFICATION_REQUIRED — the step-up this attempt was opened with no longer stands ' +
      'for this customer. Resolved by verifying the contact again and starting a new ' +
      'attempt; it is not a statement about the link.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every attempt ' +
      'this link does not open. Identical in status, code, message and shape whether the ' +
      'token is unknown, expired, revoked, superseded or for another target, or the attempt ' +
      'does not exist, belongs to another obligation, or belongs to somebody else.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 408,
    description: 'The upload exceeded the hard duration.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      `EVIDENCE_QUOTA_REACHED when the attempt already holds ${MAX_EVIDENCE_PER_ATTEMPT} ` +
      'images; EVIDENCE_ATTEMPT_CLOSED when the attempt has finished and accepts no more; ' +
      'IDEMPOTENCY_CONFLICT or ASSET_UPLOAD_IN_PROGRESS for a conflicting or duplicate ' +
      'attempt with this key.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 413,
    description: 'The image exceeds the maximum permitted size.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported media type, or the content does not match its declared type.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'Image storage is temporarily unavailable.',
    schema: ERROR_SCHEMA,
  })
  async upload(
    @Req() request: IncomingMessage & NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<TransferEvidenceUploadView> {
    return this.guarded(() =>
      this.uploads.upload(request, (token) => this.admit(request, token, response)),
    );
  }

  @Post('status')
  // A `POST` that reads. `200`, not Nest's `201` default, because nothing was
  // created — exactly as `APP7-B03`'s deposit read and QR download are.
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('TRANSFER_EVIDENCE_STATUS', 'Transfer evidence read.')
  @ApiOperation({
    summary: 'Read the transfer images already submitted for one attempt',
    description:
      'Lists what has been submitted for the named bank-transfer attempt and how far ' +
      'inspection has got with each, so the payment screen can say "sent" and then ' +
      '"received" truthfully. Answers only for an attempt the presented link opens; ' +
      'anything else is indistinguishable from not existing. Bounded at ' +
      `${MAX_EVIDENCE_PER_ATTEMPT} entries, so there is no pagination, and an empty list ` +
      'is an ordinary case. It reads only: nothing is submitted, no payment, order or asset ' +
      'state changes, and no image content is served — the response carries metadata and ' +
      'status, never bytes, a URL or a storage location.',
  })
  @ApiBody({ type: ReadTransferEvidenceBody })
  @ApiResponse({
    status: 200,
    description: 'Between zero and five submissions, oldest first.',
    schema: envelopeSchemaOf(TransferEvidenceListResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed body.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'REVERIFICATION_REQUIRED — the attempt’s step-up no longer stands.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description:
      'SECURE_LINK_UNAVAILABLE — the one answer to every unusable token and every attempt ' +
      'this link does not open.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many secure-link requests from this source; Retry-After indicates the wait.',
    headers: { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } },
    schema: ERROR_SCHEMA,
  })
  async status(
    @Body() body: ReadTransferEvidenceBody,
    @Req() request: NetworkReadableRequest,
    @Res({ passthrough: true }) response: HeaderSettableResponse,
  ): Promise<TransferEvidenceListView> {
    // The global pipe already validated this body against the same schema; this
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = readTransferEvidenceSchema.parse(body);

    return this.guarded(async () => {
      await this.admit(request, input.accessToken, response);
      return this.reader.read({
        token: input.accessToken,
        attemptId: input.attemptId,
        now: this.clock.now(),
      });
    });
  }

  /**
   * The delivered public admission: the same fail-closed policy read, abuse
   * budget and digest the deposit read and the initiation use.
   *
   * Charged once per request so a caller cannot escape `secure_link.resolve`'s
   * budget by spreading token guesses across the deposit read, the QR, the
   * initiation and these two. It is **not** the authorization the operation acts
   * on: both operations re-establish the grant inside their own transaction
   * under its row lock (ADR-DB3-004 r9), which is what makes a concurrent revoke
   * win.
   *
   * The upload runs it inside its own service, after the parser has produced the
   * token and before a single image byte is read.
   */
  private async admit(
    request: NetworkReadableRequest,
    token: string,
    response: HeaderSettableResponse,
  ): Promise<void> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, token);
    if (admission.outcome === 'RATE_LIMITED') {
      response.setHeader('Retry-After', String(admission.retryAfterSeconds));
      throw new HttpException(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many secure-link requests. Please wait.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Runs the operation, translating this surface's three refusal families.
   *
   * Anything else propagates to the platform filter, which sanitises it.
   * Catching more broadly here is how a `PersistenceError` — whose diagnostics
   * name a constraint and can quote a column — would be shaped into a response
   * by this file, and how a database fault would become a token-validity signal.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isSecureLinkError(error)) throw toSecureLinkHttpException(error);
      if (isTransferEvidenceError(error)) throw toTransferEvidenceHttpException(error);
      if (isDepositError(error)) throw toDepositHttpException(error);
      if (isAssetIntakeError(error)) throw toAssetIntakeHttpException(error);
      throw error;
    }
  }
}
