/**
 * The customer shipping-fee acknowledgement body (`APP9-B04-C1` §4).
 *
 * Two fields, and the list of what is *not* here is the point:
 *
 * ```text
 * accepted   token           the secure link, read from the URL fragment
 *            newFeeAmount    the exact fee this customer is accepting
 *
 * refused    orderId         resolved from the grant
 *            customerId      resolved from the grant
 *            grantId         resolved from the token
 *            challengeId     resolved from the customer
 *            previousFeeAmount  server authority — the current baseline
 *            currencyCode    VND, a database CHECK
 *            shippingDetailId   never addressed by a customer at all
 * ```
 *
 * `previousFeeAmount` is the one worth stating twice. A caller-supplied old fee
 * would let a stale screen — or a crafted request — bind an acknowledgement to a
 * baseline that is not the order's, and the Admin write matches on that field.
 * It is derived from the locked shipping detail inside the transaction instead.
 *
 * `newFeeAmount` is accepted because it is the decision: the customer is
 * accepting one specific figure, and the server checks it is an increase over
 * the real baseline before recording anything. Accepting it is what makes the
 * evidence a decision about a number rather than a blanket consent.
 *
 * `.strict()`: an unknown field is a 400, never silently ignored.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** The delivered `APP4` secure-link token shape: 32 random bytes, base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** `numeric(14,2)` — twelve integer digits, two fractional, no exponent form. */
const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export const acknowledgeShippingFeeSchema = z
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
    newFeeAmount: z
      .string()
      .regex(AMOUNT_PATTERN)
      .meta({
        description:
          'The exact new shipping fee the customer is accepting, in VND as a decimal string ' +
          '(whole đồng). It must be higher than the fee the order currently carries — this ' +
          'command records acceptance of an increase and nothing else. The fee being moved ' +
          'from is the server’s, never the caller’s.',
      }),
  })
  .strict()
  .meta({
    id: 'AcknowledgeShippingFeeBody',
    description:
      'Records the customer’s acceptance of one exact shipping-fee increase on the order ' +
      'their secure link opens. The order, customer, current fee, currency, grant and ' +
      'step-up evidence are all resolved by the server; none of them is accepted here.',
  });

export type AcknowledgeShippingFeeInput = z.infer<typeof acknowledgeShippingFeeSchema>;

export class AcknowledgeShippingFeeBody extends createZodDto(acknowledgeShippingFeeSchema) {}

registerZodDtos(AcknowledgeShippingFeeBody);
