/**
 * The grant-scoped deposit request contracts (`APP7-B03` §7, §28).
 *
 * **One field on each of the three bodies, and the absences are the contract.**
 * `.strict()` refuses everything else by construction, and each plausible extra
 * field is a distinct defect `APP7-B03` names:
 *
 * - no `orderId` and no order `code` — the order is reached through
 *   `uq_orders__request` from the grant's request, not through a locator a
 *   caller chose. A public route taking an order id would be an enumeration
 *   oracle for other customers' orders;
 * - no `paymentObligationId` and no `attemptId` — the DEPOSIT obligation is
 *   derived server-side and the QR is built from it. `APP7-B03` §8 requires the
 *   server to derive the exact deposit context, which is what having no
 *   parameter guarantees;
 * - no `amount`, `currency`, `method`, `providerKey`, `providerRef` or payment
 *   reference — all server-owned. The amount is copied off the frozen obligation
 *   (`APP7-G01` §5) and the method is the constant `BANK_TRANSFER`;
 * - no `customerId`, `email` or `phone` — this surface establishes no identity;
 * - no `grantId` and no `scopeKind` — `REQUEST_ACCESS` is authority
 *   (ADR-DB3-004 r1), not input;
 * - no `stepUpChallengeId` — the step-up is derived from the grant's customer,
 *   so a caller cannot present someone else's proof of presence
 *   (`step-up-evidence.resolver.ts` records why in full);
 * - no bank account data of any kind — the merchant account is configuration.
 *
 * **The token is in the body and only the body**, and all three routes are
 * `POST` for that reason alone. `ADR-APP4-001` §11 makes the URL fragment the
 * sole browser carrier and declares a path or query carrier `FORBIDDEN` with no
 * fallback, because both are written to the Nginx access log, the application
 * request log, every proxy in between, and the `Referer` of any link the page
 * later renders. That applies to the QR operation as much as to the JSON ones —
 * a `GET .../qr?token=…` would put a live credential into every access log
 * between the browser and the process — so the binary route is a `POST` too.
 * The read and the QR are idempotent and consume nothing despite the verb.
 *
 * **There is no `example` for the token**, for the reason `APP4-B06`, `APP5-B03`
 * and `APP6-B04` all record: an example token is a credential-shaped string
 * published in `openapi.generated.json`, rendered in Swagger UI and pre-filled
 * into "try it out".
 *
 * The pattern restates `ADR-APP4-001` §5.2's published wire bound — 32 CSPRNG
 * bytes as unpadded base64url — rather than importing the issuer's current
 * length, on the rule `APP5-B03` records: this is the frozen contract a
 * generated client carries. It is not a security control; a well-formed token
 * still resolves for nobody unless it digests to a live grant.
 *
 * ### The attempt key is a header, not a body field
 *
 * Initiation needs one caller-owned value: LC-16 makes a retry a **new**
 * attempt, so the server cannot tell a resent request from a deliberate second
 * try, and only the caller knows which one it made. That value travels in the
 * delivered `Idempotency-Key` header, validated by the delivered
 * `parseIdempotencyKey` — the transport all three shipped intake lanes use.
 * Adding a body field for it would be a second idempotency transport for the
 * same protocol, which `APP7-B03` §9 forbids, so the initiation body carries the
 * token and nothing else.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `ADR-APP4-001` §5.2 — 43 unpadded base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const TOKEN_FIELD = z
  .string()
  .regex(TOKEN_PATTERN)
  .meta({
    description:
      'The opaque token from the secure link, read by the client from the URL fragment. ' +
      'Sent in the request body only — never as a path segment, query parameter or header, ' +
      'so it cannot reach a server or proxy access log. Never echoed back, and never ' +
      'consumed: the same link works until it expires or is revoked.',
  });

export const readDepositSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'ReadDepositBody',
    description:
      'Presents a secure-link token to read the deposit owed on the order that link already ' +
      'opens. No order, obligation, attempt, amount or customer identifier is accepted.',
  });

export type ReadDepositInput = z.infer<typeof readDepositSchema>;

export class ReadDepositBody extends createZodDto(readDepositSchema) {}

export const depositQrSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'DepositQrBody',
    description:
      'Presents a secure-link token to download the bank-transfer QR for the deposit that ' +
      'link opens. The account, the amount and the transfer reference are all server-owned; ' +
      'no attempt id and no QR input is accepted.',
  });

export type DepositQrInput = z.infer<typeof depositQrSchema>;

export class DepositQrBody extends createZodDto(depositQrSchema) {}

export const initiateDepositAttemptSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'InitiateDepositAttemptBody',
    description:
      'Presents a secure-link token to open one BANK_TRANSFER payment attempt against the ' +
      'deposit that link opens. The obligation, amount, currency, method and step-up ' +
      'evidence are all resolved by the server; none of them is accepted here. The caller’s ' +
      'attempt key travels in the Idempotency-Key header.',
  });

export type InitiateDepositAttemptInput = z.infer<typeof initiateDepositAttemptSchema>;

export class InitiateDepositAttemptBody extends createZodDto(initiateDepositAttemptSchema) {}

registerZodDtos(ReadDepositBody, DepositQrBody, InitiateDepositAttemptBody);
