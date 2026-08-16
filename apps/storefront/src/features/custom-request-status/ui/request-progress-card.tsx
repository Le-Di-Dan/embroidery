import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';
import type { ProgressMark, StatusPresentation } from '../model/status-presentation';

/**
 * The three-step rail (`661:13` … `661:26` desktop, `661:361` mobile).
 *
 * Three steps and no more, because the workshop's intake has three: the request
 * arrived, someone opened it, someone answered. The caption under the rail says
 * outright that quotation, design approval and payment are not part of this
 * stage — the design chose to state the absence rather than draw greyed-out
 * steps for phases that do not exist yet, and a greyed step is a promise.
 *
 * A reached step is not marked by colour alone (`634:150`): each dot carries a
 * check or its own ordinal, and each label changes weight with it. The rail is
 * an ordered list in the accessibility tree, so a screen reader gets the
 * sequence rather than five loose fragments; the dots themselves are decorative
 * and hidden, because the label already says which step it is.
 */
const MARK_GLYPH: Record<ProgressMark, string> = { DONE: '✓', CLOSED: '✓', PENDING: '' };

function stepClassName(mark: ProgressMark): string {
  return `request-status__step request-status__step--${mark.toLowerCase()}`;
}

export function RequestProgressCard({ progress }: { progress: StatusPresentation['progress'] }) {
  const steps = [
    { key: 'submitted', label: COPY.progress.steps.submitted, mark: progress.submitted },
    { key: 'underReview', label: COPY.progress.steps.underReview, mark: progress.underReview },
    { key: 'answered', label: COPY.progress.steps.answered, mark: progress.answered },
  ] as const;

  return (
    <section className="request-status__card" aria-labelledby="request-progress-title">
      <h2 className="request-status__card-title" id="request-progress-title">
        {COPY.progress.title}
      </h2>
      <ol className="request-status__rail">
        {steps.map((step, index) => (
          <li className={stepClassName(step.mark)} key={step.key}>
            <span className="request-status__step-dot" aria-hidden="true">
              {MARK_GLYPH[step.mark] === '' ? index + 1 : MARK_GLYPH[step.mark]}
            </span>
            <span className="request-status__step-label">{step.label}</span>
          </li>
        ))}
      </ol>
      <p className="request-status__card-note">{COPY.progress.note}</p>
    </section>
  );
}
