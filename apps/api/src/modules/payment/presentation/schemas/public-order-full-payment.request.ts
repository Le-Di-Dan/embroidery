/**
 * The three `APP12-B04` full-payment request bodies.
 *
 * All three carry exactly one field, and it is the same field: the secure-link
 * token. Nothing else is accepted anywhere on this surface — no order id, no
 * obligation id, no attempt id, no amount, no currency, no method, no challenge
 * id — because every one of those is resolved server-side from the
 * `ORDER_ACCESS` grant. A body that took any of them would let a caller name
 * another customer's order, a different sum, or someone else's proof of
 * presence.
 *
 * The grant's **scope** is not accepted either, and there is nowhere to put it:
 * `APP12-B04` §9 requires the scope to come from server truth, so the resolver
 * reads it from the row and this surface refuses anything that is not
 * `ORDER_ACCESS`.
 *
 * `.strict()` on all three: an unknown field is a 400, never silently ignored.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** The delivered `APP4` secure-link token shape: 32 random bytes, base64url. */
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

export const readFullPaymentSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'ReadFullPaymentBody',
    description:
      'Presents a secure-link token to read the payment owed on the Ready-Made order that ' +
      'link already opens. No order, obligation, attempt, amount or customer identifier is ' +
      'accepted.',
  });

export type ReadFullPaymentInput = z.infer<typeof readFullPaymentSchema>;

export class ReadFullPaymentBody extends createZodDto(readFullPaymentSchema) {}

export const fullPaymentQrSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'FullPaymentQrBody',
    description:
      'Presents a secure-link token to download the bank-transfer QR for the Ready-Made ' +
      'order that link opens. The account, the amount and the transfer reference are all ' +
      'server-owned; no attempt id and no QR input is accepted.',
  });

export type FullPaymentQrInput = z.infer<typeof fullPaymentQrSchema>;

export class FullPaymentQrBody extends createZodDto(fullPaymentQrSchema) {}

export const initiateFullPaymentAttemptSchema = z
  .object({ token: TOKEN_FIELD })
  .strict()
  .meta({
    id: 'InitiateFullPaymentAttemptBody',
    description:
      'Presents a secure-link token to open one BANK_TRANSFER payment attempt against the ' +
      'Ready-Made order that link opens. The obligation, amount, currency, method and ' +
      'step-up evidence are all resolved by the server; none of them is accepted here. The ' +
      'caller’s attempt key travels in the Idempotency-Key header.',
  });

export type InitiateFullPaymentAttemptInput = z.infer<typeof initiateFullPaymentAttemptSchema>;

export class InitiateFullPaymentAttemptBody extends createZodDto(
  initiateFullPaymentAttemptSchema,
) {}

registerZodDtos(ReadFullPaymentBody, FullPaymentQrBody, InitiateFullPaymentAttemptBody);
