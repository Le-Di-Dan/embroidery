import { ResponsiveText } from '../../../components/responsive-text';
import { CUSTOM_REQUEST_CONFIRMATION_COPY as COPY } from '../model/custom-request-confirmation-copy';

/**
 * The confirmation itself (`660:8` desktop, `660:56` mobile).
 *
 * ### The code is text, not a control
 *
 * It is rendered as a `<p>`, selectable and readable, with no link, no button
 * and no copy-to-clipboard affordance around it. That is deliberate: a control
 * beside an identifier reads as "use this to get in", and this identifier gets
 * nobody in anywhere. The sentence beneath it says so outright (`660:14`) — the
 * link in the message is the way back, the code is for talking to the workshop.
 *
 * When no valid code survived the navigation the block still renders, and says
 * that it cannot show one. It does not fetch, guess or reconstruct: there is no
 * endpoint that takes a code, by design (`G01 §5`).
 *
 * The success mark is `aria-hidden` — the heading beside it already says the
 * request was received, and a bare "✓" announced on its own is noise.
 */
export function ConfirmationCard({
  code,
  headingId,
}: {
  code: string | undefined;
  headingId: string;
}) {
  return (
    <section className="request-confirmation__card request-confirmation__card--success">
      {/* A div, not a p: the heading is a block and may not sit inside one. */}
      <div className="request-confirmation__headline">
        <span className="request-confirmation__mark" aria-hidden="true">
          {COPY.successMark}
        </span>
        <h1 className="request-confirmation__title" id={headingId}>
          {COPY.title}
        </h1>
      </div>
      {code === undefined ? (
        <>
          <p className="request-confirmation__code-label">{COPY.missingCode.label}</p>
          <p className="request-confirmation__note">{COPY.missingCode.note}</p>
        </>
      ) : (
        <>
          <p className="request-confirmation__code-label">{COPY.code.label}</p>
          <p className="request-confirmation__code">{code}</p>
          <p className="request-confirmation__note">
            <ResponsiveText copy={COPY.code.note} />
          </p>
        </>
      )}
      <p className="request-confirmation__badge">{COPY.statusBadge}</p>
      <div className="request-confirmation__notice">
        <p className="request-confirmation__notice-title">{COPY.secureLink.title}</p>
        <p className="request-confirmation__notice-body">
          <ResponsiveText copy={COPY.secureLink.body} />
        </p>
        <p className="request-confirmation__note">
          <ResponsiveText copy={COPY.secureLink.fallback} />
        </p>
      </div>
    </section>
  );
}
