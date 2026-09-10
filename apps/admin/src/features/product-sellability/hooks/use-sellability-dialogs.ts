'use client';

/**
 * Which dialog is open, what it is about, and how the last attempt was refused.
 *
 * Extracted from the section for one reason: without it, the section would hold
 * six mutually exclusive booleans plus two ids plus a failure, and "the SKU edit
 * dialog is open for a variant that is also mid-deactivation" would be a
 * representable state. A discriminated union makes the impossible combinations
 * unwritable rather than merely unlikely.
 *
 * Rows are addressed by **id**, never by object. The authoritative list is
 * re-read after every write, so a captured row would be a copy of a record the
 * server has since replaced — and the dialog would go on describing the state
 * before the operator's own change.
 *
 * The failure is cleared on every open and on every fresh submit, and survives
 * everything else. A refusal the operator has not acted on must not disappear
 * because a re-render happened.
 */
import { useCallback, useState } from 'react';

import type { SellabilityWriteFailure } from '../model/sellability-failure';

export type SellabilityDialogState =
  | { readonly kind: 'none' }
  | { readonly kind: 'variantCreate' }
  | { readonly kind: 'variantEdit'; readonly variantId: string }
  | { readonly kind: 'skuCreate'; readonly variantId: string }
  | { readonly kind: 'skuEdit'; readonly variantId: string; readonly skuId: string }
  | { readonly kind: 'confirmVariantDeactivate'; readonly variantId: string }
  | { readonly kind: 'confirmSkuDeactivate'; readonly skuId: string };

const CLOSED: SellabilityDialogState = { kind: 'none' };

export interface SellabilityDialogs {
  readonly state: SellabilityDialogState;
  readonly failure: SellabilityWriteFailure | null;
  readonly open: (next: SellabilityDialogState) => void;
  readonly close: () => void;
  readonly fail: (failure: SellabilityWriteFailure) => void;
  readonly clearFailure: () => void;
}

export function useSellabilityDialogs(): SellabilityDialogs {
  const [state, setState] = useState<SellabilityDialogState>(CLOSED);
  const [failure, setFailure] = useState<SellabilityWriteFailure | null>(null);

  const open = useCallback((next: SellabilityDialogState) => {
    setFailure(null);
    setState(next);
  }, []);

  const close = useCallback(() => {
    setFailure(null);
    setState(CLOSED);
  }, []);

  const fail = useCallback((next: SellabilityWriteFailure) => {
    setFailure(next);
  }, []);

  const clearFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { state, failure, open, close, fail, clearFailure };
}
