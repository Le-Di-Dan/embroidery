'use client';

/**
 * The refusal card (`909:274` … `909:281`) and the invalid-selection state that
 * borrows it.
 *
 * `909:276` states the rule: *name the reason, take the customer back to the
 * product, do not retry silently.* So this renders one approved title, one
 * approved body and — when the way out really is the product page — the drawn
 * `Quay lại sản phẩm` action. No raw backend message, no SQL, no constraint
 * name, no status code and no id reaches it (`APP12-S02` §27); every string
 * comes from `checkout-failure.ts`, which branches on the business code alone.
 *
 * The card is a live region, because a refusal after a submit does not move
 * focus on its own and a keyboard-only customer would otherwise be told nothing.
 */
import Link from 'next/link';

import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import { refusalCopyOf, type CheckoutFailure } from '../model/checkout-failure';
import { READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';

const { refusal, invalidSelection } = READY_MADE_CHECKOUT_COPY;

export interface CheckoutRefusalCardProps {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly returnToProduct: boolean;
}

export function CheckoutRefusalCard(props: CheckoutRefusalCardProps) {
  const { slug, title, body, returnToProduct } = props;

  return (
    <section className="ready-made-checkout__card" role="alert">
      <div className="ready-made-checkout__refusal">
        <p className="ready-made-checkout__refusal-title">
          <span aria-hidden="true">{refusal.mark}</span> {title}
        </p>
        <p className="ready-made-checkout__refusal-body">{body}</p>
      </div>
      {returnToProduct ? (
        <Link className="ready-made-checkout__back" href={buildStorefrontProductDetailPath(slug)}>
          {refusal.back}
        </Link>
      ) : null}
    </section>
  );
}

/** The same card, for a submission the server refused. */
export function CheckoutFailureCard({
  slug,
  failure,
}: {
  readonly slug: string;
  readonly failure: CheckoutFailure;
}) {
  const copy = refusalCopyOf(failure);
  return (
    <CheckoutRefusalCard
      slug={slug}
      title={copy.title}
      body={copy.body}
      returnToProduct={copy.returnToProduct}
    />
  );
}

/**
 * The same card, for an address that names nothing buyable.
 *
 * One state for all four refusal reasons on purpose. `missing-sku`,
 * `unknown-sku`, `not-purchasable` and `unavailable` are different facts *to the
 * checkout*, and telling them apart to the customer would publish whether a SKU
 * id exists, which is the same disclosure `APP12-B02` collapses into one
 * `SKU_NOT_AVAILABLE`. The remedy is identical in every case: choose again on
 * the Product page.
 */
export function CheckoutInvalidSelectionCard({ slug }: { readonly slug: string }) {
  return (
    <CheckoutRefusalCard
      slug={slug}
      title={invalidSelection.title}
      body={invalidSelection.body}
      returnToProduct
    />
  );
}
