/**
 * The one `APP12-B04` secure order-read body.
 *
 * One field, and it is the secure-link token. No order id, no order code, no
 * customer identifier and no scope: the order and the scope both come from the
 * grant row, so a body that carried either would let a caller name another
 * customer's order or assert which release wave it belongs to (`APP12-B04` §9,
 * §11).
 *
 * The token shape is the delivered `APP4` one, and is validated here for the
 * same reason every other secure surface validates it: a malformed credential
 * is a 400 before any HMAC is computed, so garbage costs no CPU.
 *
 * `.strict()`: an unknown field is a 400, never silently ignored.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** The delivered `APP4` secure-link token shape: 32 random bytes, base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const readReadyMadeOrderSchema = z
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
    id: 'ReadReadyMadeOrderBody',
    description:
      'Presents a secure-link token to read the one Ready-Made order that link opens. No ' +
      'order id, order code, obligation id or customer identifier is accepted.',
  });

export type ReadReadyMadeOrderInput = z.infer<typeof readReadyMadeOrderSchema>;

export class ReadReadyMadeOrderBody extends createZodDto(readReadyMadeOrderSchema) {}

registerZodDtos(ReadReadyMadeOrderBody);
