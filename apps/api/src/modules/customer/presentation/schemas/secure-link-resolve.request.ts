/**
 * The secure-link resolve request contract (`APP4-B06` §6).
 *
 * **One field, and the absences are the contract.** `.strict()` refuses
 * everything else by construction — not as a tidiness rule, but because each
 * plausible extra field is a distinct security defect:
 *
 * - no `customerId` / `customRequestId` / `grantId` — the grant's target is read
 *   from the persisted row, and accepting one would let anyone holding a token
 *   assert *whose* grant it is;
 * - no `scopeKind` / `purpose` — `REQUEST_ACCESS` is authority (ADR-DB3-004 r1),
 *   and a caller-selected scope is a privilege escalation with extra steps;
 * - no `email` / `phone` — this endpoint establishes no identity and must not
 *   become a place to probe one;
 * - no `sessionId` — the APP3 anonymous Session is a different credential family
 *   with its own transport ruling (IMP-D043).
 *
 * **The token is in the body and only the body.** No path segment, no query
 * parameter, no header. A path or query carrier would be written to the Nginx
 * access log, the application request log, every proxy in between, and the
 * `Referer` of any link the landing page later renders — which is the entire
 * reason `ADR-APP4-001` §11 makes the fragment the sole browser carrier and
 * declares a query carrier `FORBIDDEN` with no fallback.
 *
 * **There is no `example`.** Every other schema in this module carries one, and
 * this one deliberately does not: an example token is a credential-shaped string
 * published in `openapi.generated.json`, rendered in Swagger UI, and pre-filled
 * into "try it out". `APP4-B05`'s report hygiene rule — no token-shaped literal —
 * applies to the published contract too.
 *
 * The pattern and length mirror `APP4-P01`'s issued form (32 CSPRNG bytes as
 * unpadded base64url = 43 characters). That is the *wire* bound, and it is not a
 * security control: a well-formed token is still rejected by the resolver unless
 * it digests to a live grant. Its purpose is to refuse obvious junk before any
 * HMAC work, and a malformed body answering `400` discloses nothing about
 * whether any token exists.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * `ADR-APP4-001` §5.2 — 43 unpadded base64url characters.
 *
 * Restated here rather than imported from the issuer: this is the *published
 * wire contract*, which an OpenAPI schema freezes into every generated client,
 * while the issuer's constant is what the server mints today. Tying the two
 * would let a future entropy change silently break deployed clients. The
 * checker asserts they still agree.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const resolveSecureLinkSchema = z
  .object({
    token: z
      .string()
      .regex(TOKEN_PATTERN)
      .meta({
        description:
          'The opaque token from the secure link, read by the client from the URL fragment. ' +
          'Sent in the request body only — never as a path segment, query parameter or ' +
          'header, so it cannot reach a server or proxy access log. Never echoed back.',
      }),
  })
  .strict()
  .meta({
    id: 'ResolveSecureLinkBody',
    description: 'Presents a secure-link token for resolution.',
  });

export type ResolveSecureLinkInput = z.infer<typeof resolveSecureLinkSchema>;

export class ResolveSecureLinkBody extends createZodDto(resolveSecureLinkSchema) {}

registerZodDtos(ResolveSecureLinkBody);
