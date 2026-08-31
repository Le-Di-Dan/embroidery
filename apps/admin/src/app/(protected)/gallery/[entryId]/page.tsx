import { GalleryEditorScreen } from '../../../../features/gallery-editor';

interface GalleryEditorPageProps {
  readonly params: Promise<{ readonly entryId: string }>;
}

/**
 * `/gallery/[entryId]` — the Admin gallery editor (`APP11-A02`).
 *
 * The segment is the entry's UUID, not its public slug: the slug is the address
 * a customer visits, and addressing the Admin editor by it would tie an
 * operator's URL to the storefront's vocabulary.
 *
 * A thin boundary: it resolves the route param and hands it to the capability,
 * which owns the load states, the form, the media selection, the publication
 * panel and the conflict handling. Publication is a panel *inside* this route —
 * there is no `/gallery/[entryId]/publication`, no `/gallery/[entryId]/media`
 * and no `/gallery/[entryId]/edit`, because they would be three addresses for
 * one screen whose parts share a single concurrency token.
 *
 * Unlike the list, this segment does not prefetch. The record carries that
 * token, and a token dehydrated on the server would already be one navigation
 * old by the time the operator pressed save.
 */
export default async function GalleryEditorPage({ params }: GalleryEditorPageProps) {
  const { entryId } = await params;
  return <GalleryEditorScreen entryId={entryId} />;
}
