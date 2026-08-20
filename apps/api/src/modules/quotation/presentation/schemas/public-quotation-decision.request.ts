/**
 * The two customer quotation decision bodies (`APP6-B05` §5).
 *
 * **Two fields, and the absences are still the contract.** Both schemas are
 * `.strict()`, so everything else is refused by construction, and every field
 * `APP6-B04`'s read declines is declined here too, for the same reasons:
 *
 * - no `quotationId` and no `requestId` — the quotation is reached through the
 *   two pointers `APP6-B03` set, from the request the grant row names. A caller
 *   that could address a quotation could address someone else's;
 * - no `customerId`, `email` or `phone` — identity comes from the grant, never
 *   from the body (`APP6-G01` §8);
 * - no `grantId` and no `scopeKind` — `REQUEST_ACCESS` is authority
 *   (ADR-DB3-004 r1), not input;
 * - no `challengeId` — and this is the one `APP6-B04` reserved for this
 *   checkpoint. GRD-003 is satisfied by evidence the server **derives** from the
 *   grant's customer (`StepUpEvidenceResolver`), not by a locator the caller
 *   chooses. The rejected alternative was not unsafe — a fully revalidating
 *   server would be equally safe — it was pointless and fragile: everything the
 *   server would have to prove about the id is the query it can run anyway, and
 *   a customer who verified twice, or verified on their other contact, would be
 *   refused for sending an id that was real, theirs and fresh;
 * - no `acceptedTotalAmount` and no confirmation boolean. The total is not a
 *   client-confirmed value here because it cannot vary independently of
 *   `versionId`: `trg_quotation_versions__reject_mutation` freezes a sent
 *   version's amounts, so naming the version *is* naming the price, and an
 *   amount field would add a way for a correct decision to be refused over a
 *   formatting difference between `1500000.00` and `1500000.0`. The fingerprint
 *   `APP6-G01` §10 specifies still carries the total — read off the frozen row
 *   inside the transaction, where it is authority;
 * - no rejection reason. LC-12 marks it optional and the schema offers nowhere
 *   to put one — `quotation_versions` has `void_reason` for `TR-LC12-07` and
 *   nothing for a rejection — so accepting text the database cannot keep would
 *   be a promise to the customer that nothing honours.
 *
 * ### `versionId` is a fingerprint, not a locator
 *
 * It is the one identifier either body carries, and it exists because a stale
 * acceptance must be *refusable*: `APP6-B04` returns the exact version the
 * customer is looking at so their decision can name it, and GRD-006 compares
 * that name against `quotations.current_version_id` inside the deciding
 * transaction. A version id from another quotation resolves to a real row and is
 * refused before anything is written — the comparison it must pass is with a
 * pointer the caller cannot influence, not with the id it supplied.
 *
 * ### The token is in the body and only the body
 *
 * `ADR-APP4-001` §11 makes the URL fragment the sole browser carrier and
 * declares a path or query carrier `FORBIDDEN` with no fallback: both are
 * written to the Nginx access log, the application request log, every proxy in
 * between, and the `Referer` of any link the page later renders. There is no
 * `example` for the token, on the rule `APP4-B06`, `APP5-B03` and `APP6-B04` all
 * record — an example token is a credential-shaped string published in
 * `openapi.generated.json` and pre-filled into Swagger UI's "try it out".
 *
 * The token pattern restates `ADR-APP4-001` §5.2's published wire bound rather
 * than importing the issuer's current length: this is the frozen contract a
 * generated client carries. It is not a security control; a well-formed token
 * still resolves for nobody unless it digests to a live grant.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `ADR-APP4-001` §5.2 — 43 unpadded base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const token = z
  .string()
  .regex(TOKEN_PATTERN)
  .meta({
    description:
      'The opaque token from the secure link, read by the client from the URL fragment. ' +
      'Sent in the request body only — never as a path segment, query parameter or header, ' +
      'so it cannot reach a server or proxy access log. Never echoed back, and never ' +
      'consumed: the same link works until it expires or is revoked.',
  });

const versionId = z
  .string()
  .uuid()
  .meta({
    description:
      'The exact quotation version this decision is about — the `versionId` the current-' +
      'quotation read returned. It is checked against the quotation’s own current pointer ' +
      'inside the deciding transaction, so a version that has been superseded by a newer ' +
      'send is refused rather than accepted, and a version belonging to another quotation ' +
      'is refused before anything is written.',
  });

export const acceptQuotationSchema = z
  .object({ token, versionId })
  .strict()
  .meta({
    id: 'AcceptQuotationBody',
    description:
      'Accepts the exact quotation version the customer was shown. No quotation, request, ' +
      'customer, grant, verification or amount identifier is accepted: the target comes ' +
      'from the grant and the server’s own pointers, and the re-verification that ' +
      'authorises the acceptance is derived from the grant’s customer.',
  });

export const rejectQuotationSchema = z
  .object({ token, versionId })
  .strict()
  .meta({
    id: 'RejectQuotationBody',
    description:
      'Declines the exact quotation version the customer was shown. Takes the same two ' +
      'fields as acceptance and no reason text, because the schema keeps no rejection ' +
      'reason. Declining a price does not reject the custom request.',
  });

export type AcceptQuotationInput = z.infer<typeof acceptQuotationSchema>;
export type RejectQuotationInput = z.infer<typeof rejectQuotationSchema>;

export class AcceptQuotationBody extends createZodDto(acceptQuotationSchema) {}
export class RejectQuotationBody extends createZodDto(rejectQuotationSchema) {}

registerZodDtos(AcceptQuotationBody, RejectQuotationBody);
