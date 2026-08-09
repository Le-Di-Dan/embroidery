import { DesignTemplateListScreen } from '../../../features/design-templates';

/**
 * `/design-templates` — the Admin Design Template list (`APP3-A02`).
 *
 * A thin boundary: the capability owns the query, the filters, the pagination
 * and the create flow.
 *
 * This segment does not prefetch. The filters live in the URL and the list is a
 * keyset collection, so a server-dehydrated first page would have to guess the
 * filter set and would be superseded by the client's own first request the
 * moment the operator narrowed it.
 */
export default function DesignTemplatesPage() {
  return <DesignTemplateListScreen />;
}
