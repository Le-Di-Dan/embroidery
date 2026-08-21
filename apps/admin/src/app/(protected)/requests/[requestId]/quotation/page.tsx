import { QuotationWorkbenchScreen } from '../../../../../features/request-quotation';

interface QuotationPageProps {
  readonly params: Promise<{ readonly requestId: string }>;
}

/**
 * `/requests/{requestId}/quotation` — the Admin quotation workbench
 * (`APP6-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the request context read, the
 * drafting form, the version history and the send.
 *
 * This segment does not prefetch, for the same reason `/requests/{requestId}`
 * does not. The reads behind it describe a request another operator may be
 * quoting right now, which is a poor fit for a dehydrated cache travelling
 * inside the HTML, and the client's own reads would supersede it on mount.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: every operation behind this screen re-checks the Admin session,
 * and a request id in a URL grants nothing on its own.
 */
export default async function RequestQuotationPage({ params }: QuotationPageProps) {
  const { requestId } = await params;

  return <QuotationWorkbenchScreen requestId={requestId} />;
}
