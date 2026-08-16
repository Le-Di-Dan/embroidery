/**
 * The grant-scoped status request contract (`APP5-B03` §4, §5).
 *
 * **One field, and the absences are the contract.** `.strict()` refuses
 * everything else by construction, and each plausible extra field is a distinct
 * defect this checkpoint's acceptance criteria name:
 *
 * - no `requestId` — the request is read from the grant row (`APP5-B03` §4). A
 *   caller-supplied id is the "arbitrary request id without grant proof" §3
 *   forbids, and would make "grant A cannot read request B" a comparison rather
 *   than an impossibility;
 * - no `code` — `APP5-G01` §5 and COL-TBL037-01 make the request code
 *   display-only and **never an authorization input**. It leaves in the
 *   response; it never arrives in a request;
 * - no `customerId`, `email` or `phone` — this surface establishes no identity
 *   and must not become a place to probe one;
 * - no `challengeId` — the verified challenge authorizes *submission* and
 *   *intake* (`G01-D01`); it is spent by the submission and is not a status
 *   credential;
 * - no `scopeKind` — `REQUEST_ACCESS` is authority (ADR-DB3-004 r1), not input.
 *
 * **The token is in the body and only the body**, and the route is a `POST` for
 * that reason alone. `ADR-APP4-001` §11 makes the URL fragment the sole browser
 * carrier and declares a path or query carrier `FORBIDDEN` with no fallback,
 * because both are written to the Nginx access log, the application request log,
 * every proxy in between, and the `Referer` of any link the page later renders.
 * The read is idempotent and consumes nothing despite the verb.
 *
 * **There is no `example`,** for the reason `APP4-B06`'s body records: an
 * example token is a credential-shaped string published in
 * `openapi.generated.json`, rendered in Swagger UI and pre-filled into "try it
 * out".
 *
 * The pattern restates `APP4-B06`'s published wire bound (`ADR-APP4-001` §5.2 —
 * 32 CSPRNG bytes as unpadded base64url) rather than importing it, on the same
 * rule: this is the frozen contract a generated client carries, not the length
 * the issuer happens to mint today. It is not a security control — a well-formed
 * token still resolves for nobody unless it digests to a live grant — only a way
 * to refuse obvious junk before any HMAC work.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `ADR-APP4-001` §5.2 — 43 unpadded base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const readCustomRequestStatusSchema = z
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
    id: 'ReadCustomRequestStatusBody',
    description: 'Presents a secure-link token to read the one request it opens.',
  });

export type ReadCustomRequestStatusInput = z.infer<typeof readCustomRequestStatusSchema>;

export class ReadCustomRequestStatusBody extends createZodDto(readCustomRequestStatusSchema) {}

registerZodDtos(ReadCustomRequestStatusBody);
