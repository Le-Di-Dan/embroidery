'use client';

import { SELLABILITY_FAILURE_COPY, SKU_AMBIGUOUS_COPY } from '../model/sellability-copy';
import type { SellabilityWriteFailure } from '../model/sellability-failure';

interface SellabilityFailureNoteProps {
  readonly failure: SellabilityWriteFailure;
  /**
   * The SKU already selling under this variant, when the refusal is the
   * ambiguity one. The server does not name it — the refusal carries a code and
   * a sanitized sentence — so it comes from the authoritative list the section
   * is already holding.
   */
  readonly conflictingSkuCode?: string;
  readonly id: string;
}

/**
 * One refused write, explained (`975:220`, `976:269`).
 *
 * `role="alert"` because the operator has just pressed a button and is looking
 * at the dialog: the outcome has to reach a screen-reader user without them
 * going hunting for it.
 *
 * Nothing rendered here comes from the server. Every sentence is selected by
 * the classification in `sellability-failure`, so no business code, SQLSTATE,
 * constraint name, request id or server prose can reach the browser through
 * this component — including in the ambiguity case, where the only server-side
 * value shown is a SKU code the operator authored themselves.
 */
export function SellabilityFailureNote({
  failure,
  conflictingSkuCode,
  id,
}: SellabilityFailureNoteProps) {
  if (failure === 'skuAmbiguous') {
    const code = conflictingSkuCode ?? '';
    return (
      <div className="product-sellability__failure" role="alert" id={id}>
        <p className="product-sellability__failure-title">{SKU_AMBIGUOUS_COPY.title}</p>
        <p className="product-sellability__failure-body">{SKU_AMBIGUOUS_COPY.body(code)}</p>
        <p className="product-sellability__failure-heading">{SKU_AMBIGUOUS_COPY.recoveryHeading}</p>
        {/*
          An ordered list, not two sentences: the steps are sequential and the
          first one is a decision only the operator may make. Nothing on this
          screen performs either of them automatically.
        */}
        <ol className="product-sellability__failure-steps">
          <li>{SKU_AMBIGUOUS_COPY.recoveryFirst(code)}</li>
          <li>{SKU_AMBIGUOUS_COPY.recoverySecond}</li>
        </ol>
        <p className="product-sellability__failure-body">{SKU_AMBIGUOUS_COPY.noAutoDeactivate}</p>
        {/*
          The second legitimate path, not a fallback: creating the SKU inactive
          now is a complete, correct outcome, and offering only the swap would
          force a deactivation the operator may not want yet.
        */}
        <p className="product-sellability__failure-body">{SKU_AMBIGUOUS_COPY.alternative}</p>
      </div>
    );
  }

  const copy = SELLABILITY_FAILURE_COPY[failure];
  return (
    <div className="product-sellability__failure" role="alert" id={id}>
      <p className="product-sellability__failure-title">{copy.title}</p>
      <p className="product-sellability__failure-body">{copy.body}</p>
    </div>
  );
}
