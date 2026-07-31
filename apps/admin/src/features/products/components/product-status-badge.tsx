import { parseProductStatus, productStatusLabel } from '../model/product-status';

interface ProductStatusBadgeProps {
  /** The raw contract value; parsed here so an unknown status renders safely. */
  readonly status: unknown;
}

/**
 * Lifecycle status as a text label with a coloured dot. The dot is decorative:
 * the label alone carries the meaning, so colour is never the only signal
 * (approved handoff `450:404` — "màu không phải tín hiệu duy nhất").
 */
export function ProductStatusBadge({ status }: ProductStatusBadgeProps) {
  const presentation = parseProductStatus(status);
  return (
    <span className={`product-status product-status--${presentation.toLowerCase()}`}>
      <span className="product-status__dot" aria-hidden="true" />
      {productStatusLabel(presentation)}
    </span>
  );
}
