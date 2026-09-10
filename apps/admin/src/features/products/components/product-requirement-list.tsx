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

/** The marker and the off-screen word for each presented state. */
const STATE_MARKER = {
  satisfied: '✓',
  unsatisfied: '!',
  // A neutral dash, not a tick and not a warning: the criterion has not been
  // evaluated against anything yet, and either of the other two marks would be
  // a claim about a product this checklist cannot make.
  pending: '–',
} as const;

const STATE_WORD = {
  satisfied: PRODUCT_PUBLICATION_COPY.requirements.satisfied,
  unsatisfied: PRODUCT_PUBLICATION_COPY.requirements.unsatisfied,
  pending: PRODUCT_PUBLICATION_COPY.requirements.pending,
} as const;

/**
 * The publication checklist (`441:228` — Requirement / Đạt, `442:189` —
 * Requirement rows in the blocked state; extended to ten criteria by
 * `APP12-N02.B01` and `977:187`…`977:638`).
 *
 * A real list, not a stack of divs: assistive technology announces the item
 * count, which is how a non-sighted operator learns how many conditions there
 * are rather than the handful the mock happens to draw.
 *
 * Every row carries a text marker *and* an off-screen word, so the three
 * presented states survive without colour — the approved handoff requires
 * exactly this ("màu không phải tín hiệu duy nhất"), and `Chưa xét` is held to
 * the same rule as the other two.
 *
 * ### `Chưa xét` is presentation, and it is only presentation
 *
 * `data-satisfied` still carries the server's verdict unchanged, so nothing
 * downstream — including the publish gate, which reads `eligible` from the
 * report and not from these rows — can be affected by how a row reads. The
 * separate `data-presentation` attribute is what the vacuity rule writes to.
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
  const anyPending = requirements.some((requirement) => requirement.presentation === 'pending');

  return (
    <>
      <ul className="product-publication__requirements">
        {requirements.map((requirement) => {
          const state = requirement.presentation;
          return (
            <li
              key={requirement.code}
              className={`product-publication__requirement product-publication__requirement--${state}`}
              data-testid={`requirement-${requirement.code}`}
              data-satisfied={requirement.satisfied ? 'true' : 'false'}
              data-presentation={state}
              {...(flagged.has(requirement.code) ? { 'data-flagged': 'true' } : {})}
            >
              <span className="product-publication__requirement-marker" aria-hidden="true">
                {STATE_MARKER[state]}
              </span>
              {/*
                The state as a word, for screen readers only. Sighted operators
                read it from the marker and the row styling; without it the
                states would be indistinguishable in the accessibility tree.
              */}
              <span className="product-publication__visually-hidden">
                {STATE_WORD[state]}
                {': '}
              </span>
              <span className="product-publication__requirement-text">{requirement.label}</span>
            </li>
          );
        })}
      </ul>
      {/*
        Rendered once, beneath the list, only when a row actually reads that
        way. Repeating it per row would put the same sentence on screen three
        times in state A, and rendering it always would explain a state the
        operator is not in.
      */}
      {anyPending ? (
        <p className="product-publication__requirements-note">
          {PRODUCT_PUBLICATION_COPY.requirements.pendingNote}
        </p>
      ) : null}
    </>
  );
}
