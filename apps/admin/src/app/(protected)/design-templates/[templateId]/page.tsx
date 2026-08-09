import { DesignTemplateEditorScreen } from '../../../../features/design-template-editor';

interface DesignTemplateEditorPageProps {
  readonly params: Promise<{ readonly templateId: string }>;
}

/**
 * `/design-templates/[templateId]` — the Admin Design Template editor
 * (`APP3-A03`).
 *
 * The segment is the `APP3-B03` Template UUID, not the public slug. The slug is
 * the *published* address and a draft may not have been published at all, so
 * addressing the editor by it would make an unpublished Template unreachable.
 *
 * A thin boundary: the capability owns the detail read, the placement context,
 * the local document, the save and every failure state.
 *
 * This segment does not prefetch. The detail response carries the
 * `expectedCurrentVersion` the save must echo back, and a version dehydrated on
 * the server would already be one navigation old before the operator could act
 * on it — which is precisely the stale write the conflict flow exists for.
 */
export default async function DesignTemplateEditorPage({ params }: DesignTemplateEditorPageProps) {
  const { templateId } = await params;
  return <DesignTemplateEditorScreen templateId={templateId} />;
}
