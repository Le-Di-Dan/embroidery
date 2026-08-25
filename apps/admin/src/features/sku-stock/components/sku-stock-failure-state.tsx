'use client';

import Link from 'next/link';

import { LOGIN_ROUTE } from '../../../config/routes';
import { ADMIN_PRODUCTS_ROUTE } from '../../products';
import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import type { StockReadFailure } from '../model/sku-stock-failure';

interface SkuStockFailureStateProps {
  readonly failure: StockReadFailure;
  readonly onRetry: () => void;
}

/**
 * Why the stock record could not be shown (`776:168`, `776:176`, `776:182`).
 *
 * Each state carries a Vietnamese title and an action sentence; the technical
 * code rides inside the body as an engineer-facing annotation, never as the
 * only copy an operator gets (`776:188`, `787:96`).
 *
 * The offered action follows what the failure actually permits:
 *
 * - **missing** — the SKU does not exist, and the foreign key is the sole
 *   authority on that. Retrying is still offered because the id may be right
 *   and the answer stale, and the catalog is offered because that is where a
 *   correct id comes from.
 * - **unauthenticated** — nothing but signing in again will help, so nothing
 *   else is offered. There is no retry that could succeed.
 * - **forbidden** — the request reached the API from a source it does not
 *   accept; repeating it from the same place would be refused identically.
 * - **retryable** — the sanitised platform failure, the one band where a second
 *   attempt can genuinely differ.
 *
 * No figure is guessed anywhere in this component. A failed read renders a
 * failure, never an empty stock record showing zeros — those are two different
 * facts and only one of them is true at a time.
 */
export function SkuStockFailureState({ failure, onRetry }: SkuStockFailureStateProps) {
  if (failure === 'unauthenticated') {
    return (
      <section className="stock-panel stock-panel--warning" role="alert" data-testid="stock-error">
        <p className="stock-panel__title">{COPY.failure.unauthenticatedTitle}</p>
        <p className="stock-panel__body">{COPY.failure.unauthenticatedBody}</p>
        <Link className="stock-panel__action" href={LOGIN_ROUTE}>
          {COPY.failure.signIn}
        </Link>
      </section>
    );
  }

  if (failure === 'forbidden') {
    return (
      <section className="stock-panel stock-panel--error" role="alert" data-testid="stock-error">
        <p className="stock-panel__title">{COPY.failure.forbiddenTitle}</p>
        <p className="stock-panel__body">{COPY.failure.forbiddenBody}</p>
      </section>
    );
  }

  if (failure === 'missing') {
    return (
      <section className="stock-panel stock-panel--error" role="alert" data-testid="stock-error">
        <p className="stock-panel__title">{COPY.failure.missingTitle}</p>
        <p className="stock-panel__body">{COPY.failure.missingBody}</p>
        <div className="stock-panel__actions">
          <Link className="stock-panel__action" href={ADMIN_PRODUCTS_ROUTE}>
            {COPY.failure.backToCatalog}
          </Link>
          <button
            type="button"
            className="stock-panel__action"
            data-testid="stock-retry"
            onClick={onRetry}
          >
            {COPY.failure.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stock-panel stock-panel--error" role="alert" data-testid="stock-error">
      <p className="stock-panel__title">{COPY.failure.retryTitle}</p>
      <p className="stock-panel__body">{COPY.failure.retryBody}</p>
      <button
        type="button"
        className="stock-panel__action"
        data-testid="stock-retry"
        onClick={onRetry}
      >
        {COPY.failure.reload}
      </button>
    </section>
  );
}
