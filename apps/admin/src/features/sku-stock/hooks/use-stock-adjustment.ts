'use client';

/**
 * The adjustment dialog's whole interaction: what the operator typed, what was
 * sent, what came back, and what the screen is allowed to believe afterwards
 * (`777:3` … `777:99`).
 *
 * ### Four phases, and the server decides every transition
 *
 * `form` → `submitting` → `success` | `refused`. Nothing advances optimistically
 * and no metric is patched from the delta: on success the screen re-reads, and
 * the "40 → 60" it reports is a snapshot taken before the write beside the
 * record the server returned with it. Both figures are server truth; neither is
 * arithmetic performed here.
 *
 * ### A refusal is answered with current truth, not with the opening snapshot
 *
 * `INVENTORY_STOCK_WOULD_GO_NEGATIVE` states an arithmetic fact — "on hand is
 * 8; −20 would reach −12" — so quoting the figure the dialog was opened with
 * could state a number that has since changed. The refusal therefore re-reads
 * the stock record first and quotes that. The delta is **not** clamped to fit:
 * how much less to remove is the operator's decision, and `777:123` gives them
 * "Sửa chênh lệch" to make it.
 *
 * ### Nothing is ever resubmitted automatically
 *
 * There is no retry loop anywhere in this hook. `APP8-B01` publishes no
 * idempotency key for this operation, so a resend is a second adjustment, not a
 * retry — which is exactly why the ambiguous transport case re-reads and stops
 * rather than trying again (`777:75`).
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import {
  classifyStockAdjustmentFailure,
  preservesEnteredFields,
  requiresStockReload,
  type StockAdjustmentFailure,
} from '../model/sku-stock-failure';
import {
  EMPTY_ADJUSTMENT_DRAFT,
  validateStockAdjustment,
  type StockAdjustmentDraft,
  type StockAdjustmentFieldErrors,
} from '../model/stock-adjustment-form';
import { applyStockAdjustment } from '../services/stock-adjustment.service';
import { useSkuStockRefresh } from './use-sku-stock-queries';

export type StockAdjustmentPhase = 'form' | 'submitting' | 'success' | 'refused';

export interface StockAdjustmentOutcome {
  /** The record as it stood before the write. */
  readonly before: AdminSkuStockResponse;
  /** The record the server returned with the write. */
  readonly after: AdminSkuStockResponse;
}

export interface StockAdjustmentRefusal {
  readonly failure: StockAdjustmentFailure;
  /** The delta that was refused, kept so the message can name it. */
  readonly delta: number;
  /** Current server truth, re-read when the failure left it unknown. */
  readonly stock: AdminSkuStockResponse | null;
}

export interface StockAdjustmentController {
  readonly phase: StockAdjustmentPhase;
  readonly draft: StockAdjustmentDraft;
  readonly fieldErrors: StockAdjustmentFieldErrors;
  readonly outcome: StockAdjustmentOutcome | null;
  readonly refusal: StockAdjustmentRefusal | null;
  readonly setDelta: (value: string) => void;
  readonly setReason: (value: string) => void;
  readonly submit: () => void;
  /** Returns from a refusal to the form with the entered values intact. */
  readonly resumeEditing: () => void;
}

export interface UseStockAdjustmentInput {
  readonly skuId: string;
  /** The record the dialog was opened against — the `before` of the report. */
  readonly stock: AdminSkuStockResponse;
}

export function useStockAdjustment({
  skuId,
  stock,
}: UseStockAdjustmentInput): StockAdjustmentController {
  const { refreshStock, refreshAll } = useSkuStockRefresh(skuId);

  const [draft, setDraft] = useState<StockAdjustmentDraft>(EMPTY_ADJUSTMENT_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<StockAdjustmentFieldErrors>({});
  const [outcome, setOutcome] = useState<StockAdjustmentOutcome | null>(null);
  const [refusal, setRefusal] = useState<StockAdjustmentRefusal | null>(null);

  const mutation = useMutation({
    mutationFn: applyStockAdjustment,
    // No retry. A resend is a second adjustment, not a repeat of the first.
    retry: false,
  });

  // Editing a field clears that field's error and only that one: a delta the
  // operator has just corrected must stop being announced as invalid, while a
  // still-blank reason must keep being.
  const setDelta = useCallback((value: string) => {
    setDraft((current) => ({ ...current, delta: value }));
    setFieldErrors(({ delta: _cleared, ...rest }) => rest);
  }, []);

  const setReason = useCallback((value: string) => {
    setDraft((current) => ({ ...current, reason: value }));
    setFieldErrors(({ reason: _cleared, ...rest }) => rest);
  }, []);

  const resumeEditing = useCallback(() => {
    setRefusal(null);
  }, []);

  const submit = useCallback(() => {
    // The duplicate-submit guard. The button is disabled while in flight, but a
    // keyboard submit or a double-fire must not reach the wire either: this is
    // the operation that moves stock, and sending it twice moves stock twice.
    if (mutation.isPending) return;

    const validation = validateStockAdjustment(draft);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setRefusal(null);
    const before = stock;

    mutation.mutate(
      { skuId, body: validation.body },
      {
        onSuccess: (after) => {
          setOutcome({ before, after });
          void refreshAll();
        },
        onError: (error: unknown) => {
          const failure = classifyStockAdjustmentFailure(error);
          if (!preservesEnteredFields(failure)) {
            setDraft(EMPTY_ADJUSTMENT_DRAFT);
          }
          setRefusal({ failure, delta: validation.delta, stock: null });
          if (!requiresStockReload(failure)) return;
          void refreshStock().then((current) => {
            setRefusal((existing) =>
              existing === null ? existing : { ...existing, stock: current ?? null },
            );
          });
        },
      },
    );
  }, [draft, mutation, refreshAll, refreshStock, skuId, stock]);

  const phase: StockAdjustmentPhase = mutation.isPending
    ? 'submitting'
    : outcome !== null
      ? 'success'
      : refusal !== null
        ? 'refused'
        : 'form';

  return {
    phase,
    draft,
    fieldErrors,
    outcome,
    refusal,
    setDelta,
    setReason,
    submit,
    resumeEditing,
  };
}

/** The dialog heading for a phase — `777:102` renames it on a refusal. */
export function adjustmentHeading(phase: StockAdjustmentPhase): string {
  if (phase === 'success') return COPY.success.title;
  if (phase === 'refused') return COPY.refusal.negativeHeading;
  return COPY.adjust.title;
}
