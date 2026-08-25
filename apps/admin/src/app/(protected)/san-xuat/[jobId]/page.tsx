import { ProductionJobScreen } from '../../../../features/production-job';

interface ProductionJobPageProps {
  readonly params: Promise<{ readonly jobId: string }>;
}

/**
 * `/san-xuat/{jobId}` — the Admin production job detail (`APP8-A03`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the detail read and the three
 * guarded transitions.
 *
 * This segment does not prefetch. A job's LC-18 state is decided under a row
 * lock by whoever commands it next, so a state baked into a server-rendered
 * document can be wrong before the browser paints — and the client's own read
 * would supersede it on mount regardless. Offering a transition control from a
 * dehydrated status is exactly the stale truth an operator must not act on.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: both `APP8-B03` and `APP8-B04` re-check the Admin session on
 * every request, and a job id in a URL grants nothing on its own.
 */
export default async function ProductionJobPage({ params }: ProductionJobPageProps) {
  const { jobId } = await params;

  return <ProductionJobScreen jobId={jobId} />;
}
