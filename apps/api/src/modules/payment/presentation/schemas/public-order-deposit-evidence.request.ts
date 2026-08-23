/**
 * The published request contracts for customer transfer evidence (`APP7-B05`
 * §4, §36).
 *
 * **Two fields, and every absence is the contract.** The upload's multipart body
 * and the status read's JSON body carry the same pair and nothing else:
 *
 * - no `assetKind`, `classification`, `storageKey`, `objectKey` or `bucket` —
 *   the lane fixes the first two and the server derives the rest, and a field
 *   whose only legal value is a constant is a field whose only possible effect
 *   is to be filled in wrong;
 * - no `orderId`, `orderCode`, `paymentObligationId` — the order is reached
 *   through `uq_orders__request` from the grant's request and the obligation
 *   from the order. A public route taking either would be an enumeration oracle;
 * - no `customerId`, `grantId`, `scopeKind` or `stepUpChallengeId` —
 *   `REQUEST_ACCESS` is authority (ADR-DB3-004 r1), not input, and the step-up
 *   is the one already recorded on the attempt;
 * - no `amount`, `currency`, `method`, `providerKey`, `providerRef` or
 *   `transferReference` — evidence changes no payment fact, so it accepts none;
 * - no `evidenceId` and no `assetId` — there is no operation to address one
 *   with: this checkpoint adds no delete, no replace and no binary read;
 * - no `filename` field. The caller's filename reaches the server as part of the
 *   multipart file part and is used only inside the idempotency fingerprint; it
 *   is never persisted as evidence metadata and never returned.
 *
 * **`attemptId` is a locator, never authorization.** `APP7-B03` defined no
 * current-attempt selector on purpose, so the attempt has to be named — and
 * naming is all it does. The server re-proves grant → request → order → live
 * `DEPOSIT` obligation → that exact row before a byte is read, and a foreign or
 * fictional id is one indistinguishable `404`.
 *
 * **Both operations are `POST`, and the token is in the body only.**
 * `ADR-APP4-001` §11 makes the URL fragment the sole browser carrier and
 * declares a path or query carrier `FORBIDDEN` with no fallback, because both
 * are written to the Nginx access log, the application request log, every proxy
 * in between and the `Referer` of any link the page later renders. That is why
 * the status read is a `POST` despite being idempotent and zero-write, exactly
 * as `APP7-B03`'s deposit read and QR download already are.
 *
 * **There is no `example` for the token**, for the reason `APP4-B06`, `APP5-B03`
 * and `APP7-B03` all record: an example token is a credential-shaped string
 * published in `openapi.generated.json`, rendered in Swagger UI and pre-filled
 * into "try it out".
 *
 * The multipart schema is written out rather than derived from a DTO class,
 * because the upload handler takes the raw request: binding a `@Body()` would
 * make Nest buffer ten megabytes in memory before the handler ran, which is
 * exactly what the streaming design exists to avoid.
 *
 * ### Why the credential is `accessToken` here and `token` on the B03 bodies
 *
 * Not a preference — a constraint the two ends of the pipeline impose together.
 * `serialize-openapi-document.ts` sorts every object key recursively so the
 * committed artifact's bytes cannot depend on insertion order, and the generated
 * client appends multipart parts in the order the published schema lists them.
 * So the emitted `FormData` order is alphabetical, and a credential field named
 * `token` would be appended **after** `file` — a body the parser refuses,
 * correctly, because a credential arriving after the bytes could not have
 * authorized them.
 *
 * Renaming the field is the fix that keeps every other rule intact: the file
 * part stays `file`, as in all three shipped lanes; the ordering rule stays
 * absolute; and no generated file is hand-edited. The status body takes the same
 * name so the two B05 operations do not disagree with each other. The contract
 * suite asserts the sort relation directly, so this stays a checked invariant
 * rather than a coincidence that a future rename could silently break.
 */
import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';
import {
  MAX_EVIDENCE_PER_ATTEMPT,
  MAX_TRANSFER_EVIDENCE_BYTES,
  TRANSFER_EVIDENCE_ATTEMPT_FIELD,
  TRANSFER_EVIDENCE_TOKEN_FIELD,
} from '../../domain/evidence/transfer-evidence.policy';

/** `ADR-APP4-001` §5.2 — 43 unpadded base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The multipart part carrying the image. One, and no second. */
export const TRANSFER_EVIDENCE_FILE_PART = 'file';

const TOKEN_DESCRIPTION =
  'The opaque token from the secure link, read by the client from the URL fragment. ' +
  'Sent in the request body only — never as a path segment, query parameter or header, so ' +
  'it cannot reach a server or proxy access log. Never echoed back, and never consumed.';

const ATTEMPT_DESCRIPTION =
  'The bank-transfer attempt this image belongs to, as returned when the attempt was ' +
  'opened. A locator and not authorization: the server proves the attempt belongs to the ' +
  'deposit this link opens before accepting anything, and an attempt that is not yours is ' +
  'indistinguishable from one that does not exist.';

const TOKEN_FIELD = z.string().regex(TOKEN_PATTERN).meta({ description: TOKEN_DESCRIPTION });

const ATTEMPT_FIELD = z.string().uuid().meta({ description: ATTEMPT_DESCRIPTION });

export const readTransferEvidenceSchema = z
  .object({ accessToken: TOKEN_FIELD, attemptId: ATTEMPT_FIELD })
  .strict()
  .meta({
    id: 'ReadTransferEvidenceBody',
    description:
      'Presents a secure-link token and one attempt locator to read the transfer images ' +
      'already submitted for that attempt. Reads only; it submits nothing and changes no ' +
      'payment, order or asset state.',
  });

export type ReadTransferEvidenceInput = z.infer<typeof readTransferEvidenceSchema>;

export class ReadTransferEvidenceBody extends createZodDto(readTransferEvidenceSchema) {}

registerZodDtos(ReadTransferEvidenceBody);

/**
 * The multipart contract: two credential fields, then exactly one file part.
 *
 * The order is part of the contract and the parser enforces it. Both fields must
 * arrive before the file, because the token is what authorizes reading a single
 * byte of it and the attempt is what the idempotency scope is derived from — a
 * trailing field could guarantee neither.
 */
export function transferEvidenceMultipartSchema(): SchemaObject {
  return {
    type: 'object',
    required: [
      TRANSFER_EVIDENCE_TOKEN_FIELD,
      TRANSFER_EVIDENCE_ATTEMPT_FIELD,
      TRANSFER_EVIDENCE_FILE_PART,
    ],
    properties: {
      [TRANSFER_EVIDENCE_TOKEN_FIELD]: {
        type: 'string',
        description: `${TOKEN_DESCRIPTION} Must arrive before the file part.`,
      },
      [TRANSFER_EVIDENCE_ATTEMPT_FIELD]: {
        type: 'string',
        format: 'uuid',
        description: `${ATTEMPT_DESCRIPTION} Must arrive before the file part.`,
      },
      [TRANSFER_EVIDENCE_FILE_PART]: {
        type: 'string',
        format: 'binary',
        description:
          `Exactly one ${ACCEPTED_MEDIA_TYPES.join(', ')} image of at most ` +
          `${MAX_TRANSFER_EVIDENCE_BYTES} bytes. The declared type must match the file ` +
          'signature; SVG, GIF, PDF and every other type is refused. At most ' +
          `${MAX_EVIDENCE_PER_ATTEMPT} images may be submitted for one attempt, and none ` +
          'can be deleted or replaced afterwards.',
      },
    },
  };
}
