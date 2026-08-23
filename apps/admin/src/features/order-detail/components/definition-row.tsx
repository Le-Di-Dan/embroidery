import type { ReactNode } from 'react';

interface DefinitionRowProps {
  readonly label: string;
  readonly children: ReactNode;
  /** The full value, when the rendered one is shortened for the column. */
  readonly title?: string;
  readonly testId?: string;
}

/**
 * One label/value pair, as every card on this screen draws them (`734:37`,
 * `734:121`, `735:3`).
 *
 * A real `<dt>`/`<dd>` pair rather than two `<span>`s: the cards are definition
 * lists, and a screen reader should be able to navigate them as such. The
 * component takes children rather than a string so a value can be a badge, a
 * link or a `<time>` without a second component existing for each case.
 */
export function DefinitionRow({ label, children, title, testId }: DefinitionRowProps) {
  return (
    <div className="order-definition" {...(testId === undefined ? {} : { 'data-testid': testId })}>
      <dt className="order-definition__label">{label}</dt>
      <dd className="order-definition__value" {...(title === undefined ? {} : { title })}>
        {children}
      </dd>
    </div>
  );
}
