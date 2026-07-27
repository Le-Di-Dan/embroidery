import { assetStatusLabel, type AssetStatusPresentation } from '../model/asset-status';

interface AssetStatusBadgeProps {
  readonly presentation: AssetStatusPresentation;
}

/**
 * Lifecycle status as a text label with a coloured dot. The dot is decorative:
 * the label alone carries the meaning, so colour is never the only signal
 * (approved handoff `450:404` — "màu không phải tín hiệu duy nhất").
 */
export function AssetStatusBadge({ presentation }: AssetStatusBadgeProps) {
  const modifier = presentation.toLowerCase();
  return (
    <span className={`asset-status asset-status--${modifier}`}>
      <span className="asset-status__dot" aria-hidden="true" />
      {assetStatusLabel(presentation)}
    </span>
  );
}
