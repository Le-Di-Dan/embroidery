/**
 * Request-side validation for the two Admin drafting mutations (`APP6-B01`).
 *
 * Both bodies are `.strict()`, and that is the security property rather than a
 * style choice: `adminId`, `customerId`, `actorKind`, `code`, `version`,
 * `status`, `sentAt`, `validUntil` and every *derived* amount are server-owned,
 * and a schema that merely ignored them would accept a body claiming to set one.
 * Sent, any of them is a `400` naming the unrecognised key.
 *
 * ### What is not accepted, and why
 *
 * `lineTotalAmount`, `subtotalAmount`, `totalAmount`, `depositPercent`,
 * `depositAmount` and `remainingAmount` are **absent from the contract**. Every
 * one is derived — from the lines, from CST-064's arithmetic, and from the
 * published `quotation.deposit` policy — by `quotation-pricing.ts`. A client
 * that could send a total could send one its lines do not explain; a client that
 * could send a deposit could quote a share the business never published.
 *
 * ### Money is a string, and validated as one
 *
 * `moneySchema` accepts a bounded decimal *string* and never converts it. Zod
 * has `z.number()`; using it here would put a VND total through an IEEE-754
 * double before the domain ever saw it, which is the single failure `APP6-G01`
 * §6.2 exists to prevent. The exact parse — and the whole-đồng rule — belong to
 * `parseVndAmount`, so this layer proves only that the *shape* is an amount.
 */
import { z } from 'zod';

import { schema } from '@embroidery/database';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** UUID path parameter — rejected before any repository call. */
export const quotationIdParamSchema = z.object({ quotationId: z.string().uuid() }).strict();

export class QuotationIdParam extends createZodDto(quotationIdParamSchema) {}

/**
 * A `numeric(14,2)` amount, as text.
 *
 * Up to twelve integer digits and at most two decimals — the column's domain.
 * The leading `-` is allowed only because the manual adjustment may be a
 * discount; every other amount is refused for being negative by the pricing
 * rules, where the refusal can say which figure was wrong.
 */
const moneySchema = z
  .string()
  .regex(/^-?\d{1,12}(?:\.\d{1,2})?$/, 'Expected an amount such as "1500000" or "1500000.00".');

const descriptionSchema = z.string().trim().min(1).max(500);

const lineItemSchema = z
  .object({
    lineKind: z.enum(schema.QUOTATION_LINE_KINDS),
    description: descriptionSchema,
    /** Display reference only (REL-069, INV-12) — never used to re-derive a price. */
    skuId: z.string().uuid().optional(),
    quantity: z.number().int().positive().max(1_000_000),
    unitPriceAmount: moneySchema,
  })
  .strict();

/**
 * The version body both operations share.
 *
 * Bounded at 200 lines: the column imposes no limit, and an unbounded array is a
 * write amplification an authenticated operator should still not be able to
 * perform by accident.
 */
const draftVersionShape = {
  quantityTotal: z.number().int().positive().max(1_000_000),
  stitchCount: z.number().int().nonnegative().max(100_000_000).optional(),
  shippingFeeAmount: moneySchema,
  manualAdjustmentAmount: moneySchema.optional(),
  adjustmentReason: z.string().trim().min(1).max(2_000).optional(),
  lineItems: z.array(lineItemSchema).min(1).max(200),
};

export const createQuotationDraftBodySchema = z
  .object({
    customRequestId: z.string().uuid(),
    ...draftVersionShape,
  })
  .strict();

export class CreateQuotationDraftBody extends createZodDto(createQuotationDraftBodySchema) {}

export const addQuotationVersionBodySchema = z.object({ ...draftVersionShape }).strict();

export class AddQuotationVersionBody extends createZodDto(addQuotationVersionBodySchema) {}

registerZodDtos(QuotationIdParam, CreateQuotationDraftBody, AddQuotationVersionBody);
