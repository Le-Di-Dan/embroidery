import { DesignCaseWorkbenchScreen } from '../../../../../features/request-design-case';

interface DesignPageProps {
  readonly params: Promise<{ readonly requestId: string }>;
}

/**
 * `/requests/{requestId}/design` — the Admin design-case workbench
 * (`APP6-A02`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the request context read, the
 * submitted source, the version history, the exact-version detail, the authoring
 * surface and the send.
 *
 * This segment does not prefetch, for the same reason `/requests/{requestId}`
 * and `/requests/{requestId}/quotation` do not. The reads behind it describe a
 * design thread another operator may be authoring right now, which is a poor fit
 * for a dehydrated cache travelling inside the HTML, and the client's own reads
 * would supersede it on mount. They also carry a customer's Design Document
 * behind `no-store`, which has no business being serialised into a page's
 * payload.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: every operation behind this screen re-checks the Admin session,
 * and a request id in a URL grants nothing on its own.
 */
export default async function RequestDesignPage({ params }: DesignPageProps) {
  const { requestId } = await params;

  return <DesignCaseWorkbenchScreen requestId={requestId} />;
}
