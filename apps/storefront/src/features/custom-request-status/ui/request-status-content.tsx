import type { RefObject } from 'react';

import { ResponsiveText } from '../../../components/responsive-text';
import {
  CUSTOM_REQUEST_STATUS_COPY as COPY,
  fill,
  fillResponsive,
} from '../model/custom-request-status-copy';
import type { RequestStatusView } from '../model/request-status-projection';
import { presentationOf } from '../model/status-presentation';
import { CurrentStatusCard } from './current-status-card';
import { NextStepsCard } from './next-steps-card';
import { ReadOnlyCard } from './read-only-card';
import { RequestProgressCard } from './request-progress-card';
import { RequestReasonCard } from './request-reason-card';
import { RequestSubjectCard } from './request-subject-card';
import { SecureAccessBar } from './secure-access-bar';

/**
 * One request, and only ever one (`661:3`, `661:67`, `661:131`, `661:199`,
 * `661:267`; `661:352` mobile).
 *
 * ### One request, not a list
 *
 * There is no list here and no route that could produce one. The grant this
 * page was opened with names exactly one request (`GRD-002`, `G01-D04`), the
 * endpoint accepts nothing but the token, and this component takes one view.
 * A customer account, a request history and a "my requests" link are all absent
 * for the same reason: no customer session exists in this system at all, and
 * the only way in is the personal link.
 *
 * ### The heading
 *
 * This component owns the page `h1`, handed down from the secure-link shell so
 * that exactly one heading is mounted per state — the three access states own
 * theirs, this owns the fourth. The two approved frames word it differently
 * (`661:9` prefixes "Yêu cầu", `661:358` prints the code alone), so both are
 * rendered inside the one heading and CSS chooses; the code itself is plain
 * selectable text, because a customer quotes it to the workshop, and it is
 * never presented as something that grants access.
 *
 * ### Layout
 *
 * Two columns at desktop and one at mobile, from the same source order the
 * mobile frame reads in: access, heading, state, progress, the workshop's
 * message where there is one, then the frozen submission. The reason card sits
 * directly under the state on mobile (`661:352` spec strip) and CSS moves it,
 * so a screen reader and a phone get the same sequence.
 */
export function RequestStatusContent({
  view,
  headingRef,
}: {
  view: RequestStatusView;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const presentation = presentationOf(view.status);

  return (
    <div className="request-status">
      <SecureAccessBar accessExpiresAt={view.accessExpiresAt} />
      <div className="request-status__headline">
        <h1 className="request-status__title" ref={headingRef} tabIndex={-1}>
          <ResponsiveText copy={fillResponsive(COPY.heading, '{code}', view.code)} />
        </h1>
        <p
          className={`request-status__badge request-status__badge--${presentation.tone.toLowerCase()}`}
        >
          <ResponsiveText
            copy={{
              wide: fill(COPY.headlineBadge, '{label}', presentation.badge),
              narrow: presentation.badge,
            }}
          />
        </p>
        <p className="request-status__submitted">
          {fill(COPY.submittedAt, '{timestamp}', view.submittedAt)}
        </p>
      </div>
      <div className="request-status__main">
        <RequestProgressCard progress={presentation.progress} />
        {presentation.reasonTitle !== undefined && (
          <RequestReasonCard
            title={presentation.reasonTitle}
            reason={view.customerVisibleReason}
            tone={presentation.tone}
          />
        )}
        <RequestSubjectCard view={view} />
      </div>
      <aside className="request-status__aside">
        <CurrentStatusCard presentation={presentation} />
        <NextStepsCard steps={presentation.nextSteps} />
        <ReadOnlyCard />
      </aside>
    </div>
  );
}
