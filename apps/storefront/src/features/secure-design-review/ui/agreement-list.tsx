'use client';

/**
 * The effective agreement set, rendered exactly as `APP6-B10` published it
 * (`711:3`, and the disabled state it produces at `709:3`).
 *
 * ## The array is the authority
 *
 * This component maps `review.agreements` and nothing else. There is no list of
 * required types here, no `PAYMENT_POLICY`/`RETURN_POLICY` constant, no
 * ordering rule and no `DESIGN_APPROVAL_TERMS`: B10 says the set "and its order
 * come from the published policy … a client must not hard-code the members",
 * and a set that could not be resolved completely arrives as a 503 rather than
 * as a short list. A second authority here would be a screen that could show a
 * different set from the one an approval binds.
 *
 * The label beside each block is the server's own `agreementType`, printed as
 * given. It is an identifier the policy publishes, not a translated caption
 * this feature chooses, so a new required type appears correctly without a
 * deploy.
 *
 * ## Content is text, never markup
 *
 * `content` is published as plain text with blank-line paragraph breaks, and it
 * is rendered as React text children — split on blank lines into `<p>` nodes.
 * There is no `dangerouslySetInnerHTML`, no HTML parsing and no Markdown
 * execution anywhere in this feature. A policy body containing `<b>` shows
 * those four characters, which is the correct behaviour for text whose hash the
 * customer's approval is about to bind.
 *
 * ## Consent is explicit, per agreement, and never implied
 *
 * One checkbox per agreement, unticked on arrival, each labelled by the
 * agreement it belongs to. Nothing pre-ticks, nothing ticks on scroll, and
 * there is no "accept all". The tick is recorded against the identity of the
 * *whole set on screen*, so a change of terms leaves nothing behind to inherit.
 */
import { useId } from 'react';

import type { DesignReviewAgreementResponse } from '@embroidery/api-client';

import { isAccepted, type AgreementIdentity } from '../model/design-review-consent';
import type { AgreementConsent } from '../model/design-review-consent';
import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';

export interface AgreementListProps {
  readonly agreements: readonly DesignReviewAgreementResponse[];
  readonly consent: AgreementConsent;
  readonly disabled: boolean;
  readonly onToggle: (
    agreements: readonly AgreementIdentity[],
    agreement: AgreementIdentity,
    accepted: boolean,
  ) => void;
}

export function AgreementList({ agreements, consent, disabled, onToggle }: AgreementListProps) {
  return (
    <section className="secure-design-review__agreements" aria-label={COPY.agreements.legend}>
      <h2 className="secure-design-review__section-title">{COPY.agreements.legend}</h2>
      <p className="secure-design-review__section-intro">{COPY.agreements.intro}</p>
      {agreements.map((agreement) => (
        <AgreementBlock
          key={agreement.agreementVersionId}
          agreement={agreement}
          accepted={isAccepted(consent, agreements, agreement)}
          disabled={disabled}
          onToggle={(next) => {
            onToggle(agreements, agreement, next);
          }}
        />
      ))}
    </section>
  );
}

function AgreementBlock({
  agreement,
  accepted,
  disabled,
  onToggle,
}: {
  readonly agreement: DesignReviewAgreementResponse;
  readonly accepted: boolean;
  readonly disabled: boolean;
  readonly onToggle: (accepted: boolean) => void;
}) {
  const checkboxId = useId();
  const contentId = useId();

  return (
    <article
      className="secure-design-review__agreement"
      data-testid={`design-review-agreement-${agreement.agreementType}`}
      data-accepted={accepted}
    >
      <header className="secure-design-review__agreement-header">
        <h3 className="secure-design-review__agreement-title">{agreement.agreementType}</h3>
        <p className="secure-design-review__agreement-meta">
          {COPY.agreements.versionLabel(agreement.version)}
        </p>
      </header>

      <div
        className="secure-design-review__agreement-content"
        id={contentId}
        lang={agreement.language}
        data-testid={`design-review-agreement-content-${agreement.agreementType}`}
      >
        {paragraphsOf(agreement.content).map((paragraph, index) => (
          // The index is the only stable key a paragraph of published prose
          // has. The list is re-rendered whole whenever the content changes —
          // a change of content is a change of `contentHash`, which is a
          // different agreement — so nothing is ever preserved across one.
          <p key={index} className="secure-design-review__agreement-paragraph">
            {paragraph}
          </p>
        ))}
      </div>

      <label className="secure-design-review__agreement-consent" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={accepted}
          disabled={disabled}
          aria-describedby={contentId}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
        <span>{COPY.agreements.accept}</span>
      </label>
    </article>
  );
}

/**
 * Published text into paragraphs.
 *
 * B10 documents the format as "plain text; paragraphs are separated by a blank
 * line", so this splits on blank lines and nothing else. It performs no other
 * transformation: no trimming of interior whitespace, no smart quotes, no
 * linkification — every one of those would render something other than the text
 * the `contentHash` covers.
 */
function paragraphsOf(content: string): readonly string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return paragraphs.length > 0 ? paragraphs : [content];
}
