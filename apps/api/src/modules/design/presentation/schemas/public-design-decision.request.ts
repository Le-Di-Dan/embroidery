/**
 * The two customer design decision contracts (`APP6-B11` §5).
 *
 * Both bodies are `.strict()`, so everything not named below is refused by
 * construction. The absences are the contract, and each plausible extra field is
 * a distinct defect this checkpoint's acceptance criteria name:
 *
 * - no `customerId`, `email` or `phone` — the customer is derived from the
 *   grant, in every APP6 operation without exception (`APP6-G01` §7);
 * - no `requestId`, no request `code`, no `designCaseId` — `APP5-G01` §5 makes
 *   the code display-only and never an authorization input, and the request and
 *   its design case are read from the grant row and the request's own pointer;
 * - no `grantId` and no `scopeKind` — `REQUEST_ACCESS` is authority
 *   (ADR-DB3-004 r1), not input;
 * - no `challengeId` and no `stepUpChallengeId` — GRD-003's evidence is
 *   **server-derived** from the grant's customer, the `APP6-B05` precedent. A
 *   client that could name a challenge could present someone else's proof of
 *   presence, or an expired one it liked better;
 * - no `status`, `toStatus` or `outcome` — the operation *is* the outcome, and
 *   `TR-LC11-09`'s `APPROVED` is a system projection with no caller-facing
 *   input (`APP6-B11` §15). There is no generic `/decision` route and no status
 *   mutation endpoint for the same reason;
 * - no `approvedAt`, `decidedAt` or any timestamp — the instant is this
 *   transaction's clock, and a caller-supplied one would put a time in immutable
 *   evidence that nothing observed;
 * - no `approvalSnapshotId` and no snapshot field — the snapshot is created by
 *   the approval, never described by it;
 * - no `productId`, `variantId`, `sideId`, `areaId` or
 *   `customerOwnedProductId` — the placement is frozen on the version and is
 *   copied from it (CST-129/CST-131);
 * - no `quantity`, `threadColors`, `productName` or contact copy — every one is
 *   read from persistence at approval time. A client that could supply them
 *   could write its own evidence;
 * - no `audit`, `correlationId`, `outbox` or `eventType` field.
 *
 * **The token is in the body and only the body**, and both routes are `POST` for
 * that reason alone. `ADR-APP4-001` §11 makes the URL fragment the sole browser
 * carrier and declares a path or query carrier `FORBIDDEN` with no fallback,
 * because both are written to the Nginx access log, the application request log,
 * every proxy in between, and the `Referer` of any link the page later renders.
 *
 * **There is no `example` for the token**, on the rule `APP4-B06`, `APP5-B03`,
 * `APP6-B04` and `APP6-B10` all record: an example token is a credential-shaped
 * string published in `openapi.generated.json`, rendered in Swagger UI and
 * pre-filled into "try it out".
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
/** CST-070's shape, shared by every content and document hash in the schema. */
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * The customer's own words on a revision request.
 *
 * Bounded rather than unbounded: `design_reviews.feedback` is `text` with no
 * length CHECK, and a public route that accepts unbounded text is a public route
 * that stores a megabyte of it. 2 000 characters is the same order as
 * `APP5-B02`'s customer note and is far more than a placement correction needs.
 * `trim()` runs before the length tests, so whitespace can neither satisfy the
 * minimum nor be stored as if it were content.
 */
const FEEDBACK_MAX_LENGTH = 2_000;

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
      'The exact design version this decision is about — the `designVersionId` the current-' +
      'review read returned. It is not a locator: the version it names must be the one the ' +
      'grant’s own request and design case already reached, and must still be the version ' +
      'awaiting a decision. A version belonging to another customer’s design case is refused ' +
      'before anything is written, and with the same answer an unusable token gets.',
  });

export const approveDesignVersionSchema = z
  .object({
    token,
    versionId,
    documentHash: z
      .string()
      .regex(SHA256_PATTERN)
      .meta({
        description:
          'The `documentHash` the current-review read returned — a fingerprint of the exact ' +
          'artwork the customer looked at, and the whole of GRD-007’s exact-design ' +
          'confirmation. It is compared with the hash stored when the version was sent; a ' +
          'value that differs means the design changed after it was presented, and the ' +
          'approval is refused rather than silently binding the customer to artwork they ' +
          'never reviewed. It is never used as a replacement hash: the stored value is what ' +
          'the Approval Snapshot freezes.',
      }),
    acceptedAgreements: z
      .array(
        z
          .object({
            agreementVersionId: z.string().uuid().meta({
              description: 'The exact agreement version the customer read, as B10 returned it.',
            }),
            contentHash: z
              .string()
              .regex(SHA256_PATTERN)
              .meta({
                description:
                  'That version’s `contentHash`, proving the customer’s screen rendered this ' +
                  'exact text. Compared with persistence and then discarded in favour of the ' +
                  'stored value: an approval may not record a hash of its own choosing.',
              }),
          })
          // No `agreementType`: it is derivable from the Agreement Version and a
          // caller-supplied one could label a payment policy as a return policy
          // in immutable evidence. No `content` and no prose either — the
          // customer is not the author of the terms they accept.
          .strict(),
      )
      .min(1)
      .max(20)
      .meta({
        description:
          'Every agreement the customer accepted, as ids and content hashes. Must be exactly ' +
          'the effective required set at the moment of approval — no more, no fewer, no ' +
          'duplicates, and each with the content hash persistence holds. The set is ' +
          're-resolved inside the approval transaction rather than trusted from the earlier ' +
          'read, so terms that changed in between refuse the approval instead of quietly ' +
          'substituting themselves. Array order is not significant.',
      }),
  })
  .strict()
  .meta({
    id: 'ApproveDesignVersionBody',
    description:
      'Approves the exact design version the customer was shown, together with the terms ' +
      'they accepted. No design case, request, customer, grant, challenge, status, ' +
      'placement, quantity or timestamp is accepted: the target comes from the grant and ' +
      'the server’s own pointers, the re-verification that authorises the approval is ' +
      'derived from the grant’s customer, and every fact the Approval Snapshot freezes is ' +
      'read from persistence.',
  });

export const requestDesignRevisionSchema = z
  .object({
    token,
    versionId,
    feedback: z
      .string()
      .trim()
      .min(1)
      .max(FEEDBACK_MAX_LENGTH)
      .meta({
        description:
          'What the customer wants changed. Required: LC-09 records a revision request with ' +
          'feedback, and a request with no text tells the workshop that something is wrong ' +
          'and nothing about what. Stored as the customer’s own words on the decision ' +
          'record; it never appears in an audit summary or an event payload.',
      }),
    // No `documentHash`. GRD-007 guards `TR-LC08-04` and not `TR-LC08-03`
    // (`DB3_TRANSITION_GUARD_CATALOG.md`), and asking for a stale fingerprint on
    // the one decision that commits nothing would refuse a customer who wants a
    // change *because* the design is not what they wanted.
    //
    // No `acceptedAgreements` either: a revision request binds no terms.
  })
  .strict()
  .meta({
    id: 'RequestDesignRevisionBody',
    description:
      'Asks for a revision of the exact design version the customer was shown. Requires the ' +
      'secure link and nothing else — no re-verification, because asking for a change ' +
      'commits nothing — and accepts no terms, no hash, no status and no identifier the ' +
      'grant already provides. It records the customer’s decision; it does not create the ' +
      'next draft and does not move the custom request.',
  });

export type ApproveDesignVersionInput = z.infer<typeof approveDesignVersionSchema>;
export type RequestDesignRevisionInput = z.infer<typeof requestDesignRevisionSchema>;

export class ApproveDesignVersionBody extends createZodDto(approveDesignVersionSchema) {}
export class RequestDesignRevisionBody extends createZodDto(requestDesignRevisionSchema) {}

registerZodDtos(ApproveDesignVersionBody, RequestDesignRevisionBody);
