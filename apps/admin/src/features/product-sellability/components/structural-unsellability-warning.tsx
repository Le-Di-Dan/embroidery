'use client';

import Link from 'next/link';

import { SELLABILITY_SECTION_HREF } from '../model/sellability-anchor';
import { SELLABILITY_COPY } from '../model/sellability-copy';
import { isStructurallyUnsellable, summarizeStructure } from '../model/variant-presentation';
import { useProductVariantsQuery } from '../hooks/use-product-variants-query';

interface StructuralUnsellabilityWarningProps {
  readonly productId: string;
  /** The authoritative product status; only `PUBLISHED` can be structurally unsellable. */
  readonly status: string;
  /** Where the publication readiness checklist lives, supplied by the screen that owns that route. */
  readonly readinessHref: string;
}

/**
 * The published-but-unbuyable banner (`974:187`, `979:321`).
 *
 * ### What it claims, and what it refuses to claim
 *
 * It says three things, each in its own sentence: the product is still
 * published, customers cannot currently order it, and the reason is structural.
 * It explicitly says this is **not** `hết hàng` — sold out is stock 0 on a SKU
 * that is still selling, and this is the absence of anything to sell. The two
 * have different repairs, and an Admin that conflated them would send the
 * operator to the stock screen for a problem no adjustment can fix.
 *
 * Stock is never read here. The judgement uses only the variant/SKU structure,
 * which is why a product that is genuinely sold out renders no warning at all.
 *
 * ### The evidence is counted, not asserted
 *
 * "Phiên bản đang hoạt động: 1 · SKU có thể đặt hàng: 0" is checkable against
 * the list directly below it. A banner that only said "something is missing"
 * would leave the operator to work out which of the two it meant.
 *
 * ### It repairs nothing on its own
 *
 * Two links out — to the section and to the readiness checklist — and no
 * action. Auto-repair would have to invent an active variant or a selling SKU,
 * which is a commercial decision with a price attached.
 *
 * Not colour-only: a text badge, a heading, a counted evidence block and
 * `role="alert"` all carry the state without it. It renders nothing at all
 * while the list is loading or failed — an unproven warning about a live
 * product is worse than none.
 */
export function StructuralUnsellabilityWarning({
  productId,
  status,
  readinessHref,
}: StructuralUnsellabilityWarningProps) {
  const query = useProductVariantsQuery(productId);
  const copy = SELLABILITY_COPY.warning;

  if (query.data === undefined) return null;

  const structure = summarizeStructure(query.data.variants);
  if (!isStructurallyUnsellable(status, structure)) return null;

  return (
    <section
      className="product-sellability-warning"
      role="alert"
      data-testid="structural-unsellability-warning"
    >
      <p className="product-sellability-warning__badge">{copy.badge}</p>
      <h3 className="product-sellability-warning__title">{copy.title}</h3>

      <div className="product-sellability-warning__evidence">
        <h4 className="product-sellability-warning__evidence-heading">{copy.evidenceHeading}</h4>
        <p data-testid="warning-active-variants">
          {copy.activeVariantCount(structure.activeVariantCount)}
        </p>
        <p data-testid="warning-eligible-skus">
          {copy.orderEligibleSkuCount(structure.orderEligibleSkuCount)}
        </p>
      </div>

      <p className="product-sellability-warning__note">{copy.notSoldOut}</p>

      <div className="product-sellability-warning__actions">
        <Link className="product-sellability-warning__action" href={SELLABILITY_SECTION_HREF}>
          {copy.toSection}
        </Link>
        <Link className="product-sellability-warning__action" href={readinessHref}>
          {copy.toReadiness}
        </Link>
      </div>
    </section>
  );
}
