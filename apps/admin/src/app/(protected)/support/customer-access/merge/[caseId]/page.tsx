import { MergeCaseScreen } from '../../../../../../features/customer-merge';

interface CustomerMergeCasePageProps {
  readonly params: Promise<{ readonly caseId: string }>;
}

/**
 * `/support/customer-access/merge/{caseId}` — one authoritative merge case
 * (`APP10-A02`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the detail read and the two
 * guarded decisions.
 *
 * This segment does not prefetch. A merge case is decided by whoever acts on it
 * next, so a state baked into a server-rendered document can be wrong before the
 * browser paints — and this screen offers an irreversible action against what it
 * shows, which is the one place a stale truth must never be acted on.
 *
 * The case id is passed down as a plain string and is never treated as an
 * authorization: `APP10-B02` and `APP10-B03` re-check the Admin session on every
 * request, and a case id in a URL grants nothing on its own. It is also the whole
 * input the screen needs, which is what makes a direct visit or a refresh work
 * without any state from the selection page.
 */
export default async function CustomerMergeCasePage({ params }: CustomerMergeCasePageProps) {
  const { caseId } = await params;

  return <MergeCaseScreen mergeCaseId={caseId} />;
}
