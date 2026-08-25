/**
 * The adjustment command the dialog builds, and the rules it is judged against
 * (`777:3`, `777:33`).
 *
 * ### The client validates, the server decides
 *
 * Every rule here mirrors one the accepted `AdjustSkuStockBody` schema already
 * enforces — a signed integer within `int32`, non-zero, with a non-blank reason
 * of at most 2000 characters. Nothing is loosened and nothing is invented: a
 * value this module accepts is a value the server's Zod pipe accepts too, so
 * client validation only ever saves a round trip on a request that was certain
 * to be refused with `400`. It is never the authority. `787:120` says exactly
 * this: "nêu đúng trường sai ngay tại ô nhập; không gửi đi".
 *
 * ### Why the delta is parsed rather than read from a number input
 *
 * The control is a text field with `inputMode="numeric"`, following the Admin
 * convention `APP3-A01` §17 set: a `type="number"` input invites the browser to
 * reformat, round, exponent-notate or silently blank a value on scroll, and an
 * adjustment that is not the number the operator typed is an audited lie. So
 * the raw string is parsed here, explicitly, and a decimal is *rejected* rather
 * than truncated — truncating `-2.5` to `-2` would submit a quantity nobody
 * asked for.
 *
 * ### The reason is never normalised
 *
 * It is validated on its trimmed form and submitted exactly as typed. The
 * ledger row is audit evidence; the bytes an operator entered are the bytes
 * that must be stored.
 */
import type { AdjustSkuStockBody } from '@embroidery/api-client';

import { SKU_STOCK_COPY as COPY } from './sku-stock-copy';

/** `AdjustSkuStockBody.delta` — the accepted `int32` band, both ends inclusive. */
const DELTA_MIN = -2_147_483_647;
const DELTA_MAX = 2_147_483_647;

/** `AdjustSkuStockBody.reason` — `maxLength` from the published schema. */
const REASON_MAX_LENGTH = 2000;

/** A signed run of digits, with optional surrounding whitespace. No decimals. */
const SIGNED_INTEGER = /^\s*[+-]?\d+\s*$/;

export interface StockAdjustmentDraft {
  readonly delta: string;
  readonly reason: string;
}

export const EMPTY_ADJUSTMENT_DRAFT: StockAdjustmentDraft = { delta: '', reason: '' };

export interface StockAdjustmentFieldErrors {
  readonly delta?: string;
  readonly reason?: string;
}

export type StockAdjustmentValidation =
  | { readonly ok: true; readonly body: AdjustSkuStockBody; readonly delta: number }
  | { readonly ok: false; readonly errors: StockAdjustmentFieldErrors };

function validateDelta(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: COPY.validation.deltaRequired };
  if (!SIGNED_INTEGER.test(raw)) return { error: COPY.validation.deltaNotInteger };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return { error: COPY.validation.deltaOutOfRange };
  if (value === 0) return { error: COPY.validation.deltaZero };
  if (value < DELTA_MIN || value > DELTA_MAX) return { error: COPY.validation.deltaOutOfRange };
  return { value };
}

function validateReason(raw: string): { value: string } | { error: string } {
  if (raw.trim() === '') return { error: COPY.validation.reasonRequired };
  if (raw.length > REASON_MAX_LENGTH) return { error: COPY.validation.reasonTooLong };
  return { value: raw };
}

/**
 * Judges the draft and, when it passes, produces the exact body that goes on
 * the wire: `delta` and `reason`, and nothing else. No `quantityOnHand`, no
 * `available`, no absolute target — `787:122` records that a body carrying a
 * server-owned field is a `400` this UI cannot provoke, and it cannot because
 * this is the only place a body is built.
 */
export function validateStockAdjustment(draft: StockAdjustmentDraft): StockAdjustmentValidation {
  const delta = validateDelta(draft.delta);
  const reason = validateReason(draft.reason);

  if ('error' in delta || 'error' in reason) {
    return {
      ok: false,
      errors: {
        ...('error' in delta ? { delta: delta.error } : {}),
        ...('error' in reason ? { reason: reason.error } : {}),
      },
    };
  }

  return { ok: true, delta: delta.value, body: { delta: delta.value, reason: reason.value } };
}

/**
 * The parsed delta, or `null` when the field does not currently hold a valid
 * one. Used only by the "Sau khi áp dụng" preview (`777:25`), which the frame
 * labels as orientation and which never replaces a rendered metric.
 */
export function parsedDelta(draft: StockAdjustmentDraft): number | null {
  const delta = validateDelta(draft.delta);
  return 'value' in delta ? delta.value : null;
}
