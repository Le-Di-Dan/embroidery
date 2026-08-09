import { DesignTemplatePublicationScreen } from '../../../../../features/design-template-lifecycle';

interface DesignTemplatePublicationPageProps {
  readonly params: Promise<{ readonly templateId: string }>;
}

/**
 * `/design-templates/[templateId]/publication` — the Admin Design Template
 * lifecycle screen (`APP3-A04`).
 *
 * A sibling of the editor rather than a mode of it. The editor answers *what
 * does this Template contain*; this screen answers *where is it in LC-24, and
 * may it go somewhere else*. Keeping them apart means the four guarded
 * transitions are never reachable from behind an unsaved draft — the editor's
 * navigation guard stands between them — and the operator who came here to
 * publish is not one keystroke from editing a published document.
 *
 * The segment is the `APP3-B03` Template UUID, not the public slug, for the same
 * reason the editor uses one: the slug is the *published* address, and a Template
 * that has never been published is exactly what this screen exists to publish.
 *
 * A thin boundary: the capability owns the detail read, the readiness
 * evaluation, the four commands and every failure state.
 *
 * This segment does not prefetch. The detail response carries the
 * `expectedCurrentVersion` every command must echo back, and a version
 * dehydrated on the server would already be one navigation old before the
 * operator could act on it — which is precisely the stale write the conflict
 * flow exists for.
 */
export default async function DesignTemplatePublicationPage({
  params,
}: DesignTemplatePublicationPageProps) {
  const { templateId } = await params;
  return <DesignTemplatePublicationScreen templateId={templateId} />;
}
