import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import type { PublicationRequirementRow } from '../model/product-publication';

interface ProductRequirementListProps {
  readonly requirements: readonly PublicationRequirementRow[];
  /**
   * Codes the last refused command objected to. Advisory only — the rows and
   * their satisfied flags always come from the readiness report, which is the
   * authority. This just lets the operator see which of them the server named.
   */
  readonly highlighted?: readonly string[];
}

/**
 * The publication checklist (`441:228` — Requirement / Đạt, `442:189` —
 * Requirement rows in the blocked state).
 *
 * A real list, not a stack of divs: assistive technology announces the item
 * count, which is how a non-sighted operator learns there are seven conditions
 * rather than the four the mock happens to draw.
 *
 * Every row carries a text marker (`✓` / `!`) *and* an off-screen word, so the
 * satisfied/unsatisfied distinction survives without colour — the approved
 * handoff requires exactly this ("màu không phải tín hiệu duy nhất").
 *
 * Order is the server's, reproduced untouched. Sorting by satisfaction would be
 * friendlier-looking and wrong: the sequence groups the requirements the way
 * the operator has to act on them, and it is also what makes the rendered list
 * comparable to the contract in a test.
 */
export function ProductRequirementList({
  requirements,
  highlighted = [],
}: ProductRequirementListProps) {
  const flagged = new Set(highlighted);

  return (
    <ul className="product-publication__requirements">
      {requirements.map((requirement) => {
        const state = requirement.satisfied ? 'satisfied' : 'unsatisfied';
        return (
          <li
            key={requirement.code}
            className={`product-publication__requirement product-publication__requirement--${state}`}
            data-testid={`requirement-${requirement.code}`}
            data-satisfied={requirement.satisfied ? 'true' : 'false'}
            {...(flagged.has(requirement.code) ? { 'data-flagged': 'true' } : {})}
          >
            <span className="product-publication__requirement-marker" aria-hidden="true">
              {requirement.satisfied ? '✓' : '!'}
            </span>
            {/*
              The state as a word, for screen readers only. Sighted operators
              read it from the marker and the row styling; without it the two
              states would be indistinguishable in the accessibility tree.
            */}
            <span className="product-publication__visually-hidden">
              {requirement.satisfied
                ? PRODUCT_PUBLICATION_COPY.requirements.satisfied
                : PRODUCT_PUBLICATION_COPY.requirements.unsatisfied}
              {': '}
            </span>
            <span className="product-publication__requirement-text">{requirement.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
