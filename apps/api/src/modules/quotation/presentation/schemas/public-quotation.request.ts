/**
 * The grant-scoped quotation request contract (`APP6-B04` §5).
 *
 * **One field, and the absences are the contract.** `.strict()` refuses
 * everything else by construction, and each plausible extra field is a distinct
 * defect this checkpoint's acceptance criteria name:
 *
 * - no `quotationId` and no `versionId` — the quotation is reached through the
 *   two pointers `APP6-B03` set, not through a locator a caller chose. A
 *   caller-supplied version id would also make `APP6-B05`'s stale-acceptance
 *   refusal meaningless: the customer could simply name the version they wanted
 *   to be current;
 * - no `requestId` and no request `code` — `APP5-G01` §5 makes the code
 *   display-only and never an authorization input, and the request is read from
 *   the grant row (`APP5-B03` §4);
 * - no `customerId`, `email` or `phone` — this surface establishes no identity
 *   and must not become a place to probe one;
 * - no `grantId` and no `scopeKind` — `REQUEST_ACCESS` is authority
 *   (ADR-DB3-004 r1), not input;
 * - no `challengeId` — step-up re-verification authorizes *acceptance*
 *   (GRD-003) and belongs to `APP6-B05`. A read must not consume one.
 *
 * **The token is in the body and only the body**, and the route is a `POST` for
 * that reason alone. `ADR-APP4-001` §11 makes the URL fragment the sole browser
 * carrier and declares a path or query carrier `FORBIDDEN` with no fallback,
 * because both are written to the Nginx access log, the application request log,
 * every proxy in between, and the `Referer` of any link the page later renders.
 * The read is idempotent and consumes nothing despite the verb.
 *
 * **There is no `example`**, for the reason `APP4-B06` and `APP5-B03` both
 * record: an example token is a credential-shaped string published in
 * `openapi.generated.json`, rendered in Swagger UI and pre-filled into "try it
 * out".
 *
 * The pattern restates `ADR-APP4-001` §5.2's published wire bound — 32 CSPRNG
 * bytes as unpadded base64url — rather than importing the issuer's current
 * length, on the rule `APP5-B03`'s body records: this is the frozen contract a
 * generated client carries. It is not a security control; a well-formed token
 * still resolves for nobody unless it digests to a live grant.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `ADR-APP4-001` §5.2 — 43 unpadded base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const readCurrentQuotationSchema = z
  .object({
    token: z
      .string()
      .regex(TOKEN_PATTERN)
      .meta({
        description:
          'The opaque token from the secure link, read by the client from the URL fragment. ' +
          'Sent in the request body only — never as a path segment, query parameter or ' +
          'header, so it cannot reach a server or proxy access log. Never echoed back, and ' +
          'never consumed: the same link works until it expires or is revoked.',
      }),
  })
  .strict()
  .meta({
    id: 'ReadCurrentQuotationBody',
    description:
      'Presents a secure-link token to read the quotation that is current for the request that ' +
      'link already opens. No quotation, version, request or customer identifier is accepted.',
  });

export type ReadCurrentQuotationInput = z.infer<typeof readCurrentQuotationSchema>;

export class ReadCurrentQuotationBody extends createZodDto(readCurrentQuotationSchema) {}

registerZodDtos(ReadCurrentQuotationBody);
