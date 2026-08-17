interface RequestDefinitionRowProps {
  readonly term: string;
  readonly value: string;
}

/**
 * One labelled fact inside a `<dl>` panel.
 *
 * A real `<dt>`/`<dd>` pair rather than two styled `<span>`s: the association
 * between a label and its value is then structural, so a screen reader reads
 * "Màu — Xanh rêu" instead of two unrelated strings that only look paired
 * because of where the stylesheet put them.
 */
export function RequestDefinitionRow({ term, value }: RequestDefinitionRowProps) {
  return (
    <div className="request-detail__row">
      <dt className="request-detail__term">{term}</dt>
      <dd className="request-detail__value">{value}</dd>
    </div>
  );
}
