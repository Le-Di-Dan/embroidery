import { CustomRequestDetailScreen } from '../../../../features/custom-request-detail';

interface RequestDetailPageProps {
  readonly params: Promise<{ readonly requestId: string }>;
}

/**
 * `/requests/{requestId}` — the Admin request detail and moderation screen
 * (`APP5-A02`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the detail read, the evidence and
 * the moderation commands.
 *
 * This segment does not prefetch, for the same reason `/requests` does not.
 * `APP5-B04` marks the detail `no-store` — the response describes a request
 * another operator may be moderating right now — which is a poor fit for a
 * dehydrated cache travelling inside the HTML, and the client's own read would
 * supersede it on mount regardless.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: `APP5-B04` and `APP5-B06` re-check the Admin session on every
 * request, and a request id in a URL grants nothing on its own.
 */
export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { requestId } = await params;

  return <CustomRequestDetailScreen requestId={requestId} />;
}
