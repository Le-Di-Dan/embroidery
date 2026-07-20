/**
 * Row → domain mapping for the AGG-16 Payment aggregate.
 *
 * Amounts stay strings throughout. This is money: a total that passed through
 * a float is a figure the business cannot defend.
 */
import type {
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
  RefundState,
  schema,
} from '@embroidery/database';

import type {
  AttemptId,
  ObligationId,
  PaymentAttempt,
  PaymentObligation,
  Refund,
  RefundId,
} from '../../domain/repositories/payment-obligation.repository';

export type ObligationRow = typeof schema.paymentObligations.$inferSelect;
export type AttemptRow = typeof schema.paymentAttempts.$inferSelect;
export type RefundRow = typeof schema.refunds.$inferSelect;

export function toObligation(row: ObligationRow): PaymentObligation {
  return {
    id: row.id as ObligationId,
    orderId: row.orderId,
    kind: row.kind as PaymentObligationKind,
    amount: row.amount,
    currencyCode: row.currencyCode,
    status: row.status as PaymentObligationState,
    satisfiedByAttemptId: (row.satisfiedByAttemptId ?? undefined) as AttemptId | undefined,
    satisfiedAt: row.satisfiedAt ?? undefined,
  };
}

export function toAttempt(row: AttemptRow): PaymentAttempt {
  return {
    id: row.id as AttemptId,
    paymentObligationId: row.paymentObligationId as ObligationId,
    amount: row.amount,
    currencyCode: row.currencyCode,
    method: row.method,
    status: row.status as PaymentAttemptState,
    providerRef: row.providerRef ?? undefined,
  };
}

export function toRefund(row: RefundRow): Refund {
  return {
    id: row.id as RefundId,
    paymentAttemptId: row.paymentAttemptId as AttemptId,
    orderId: row.orderId,
    amount: row.amount,
    status: row.status as RefundState,
    reason: row.reason,
  };
}
