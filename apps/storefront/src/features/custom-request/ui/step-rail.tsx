'use client';

/**
 * The three-step rail the approved frames draw down the side of every S01 state.
 *
 * An ordered list, because the steps genuinely are ordered and a list is what
 * conveys "3 of 3" without a widget. The current step is marked with
 * `aria-current`, and a locked step says so in words — the lock is a real
 * constraint on what the customer can do next, not decoration.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import type { FlowStep } from '../model/custom-request-flow';

export interface StepRailProps {
  readonly current: FlowStep;
  readonly subjectReady: boolean;
  readonly verified: boolean;
  readonly onNavigate: (step: FlowStep) => void;
}

export function StepRail({ current, subjectReady, verified, onNavigate }: StepRailProps) {
  const steps: readonly {
    readonly step: FlowStep;
    readonly label: string;
    readonly open: boolean;
  }[] = [
    { step: 'SUBJECT', label: CUSTOM_REQUEST_COPY.steps.subject, open: true },
    { step: 'VERIFY', label: CUSTOM_REQUEST_COPY.steps.verify, open: subjectReady },
    { step: 'ATTACH', label: CUSTOM_REQUEST_COPY.steps.attach, open: verified },
  ];

  return (
    <nav className="custom-request__rail" aria-label={CUSTOM_REQUEST_COPY.pageTitle}>
      <ol className="custom-request__rail-list">
        {steps.map((entry) => (
          <li key={entry.step} className="custom-request__rail-item">
            <button
              type="button"
              className="custom-request__rail-button"
              aria-current={current === entry.step ? 'step' : undefined}
              disabled={!entry.open}
              onClick={() => {
                onNavigate(entry.step);
              }}
            >
              {entry.label}
            </button>
            {entry.open ? null : (
              <span className="custom-request__rail-hint">
                {CUSTOM_REQUEST_COPY.steps.lockedHint}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
