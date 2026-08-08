/**
 * The runtime shape the two public Design Template reads answer with
 * (`APP3-B05`).
 *
 * Kept apart from the OpenAPI classes in `presentation/schemas` for the reason
 * `design-template-projection.ts` is: adding a field to one and forgetting the
 * other becomes a type error rather than a silently undocumented field.
 *
 * ## What is here, and what is deliberately not
 *
 * The summary is a **picker's** row — enough to show a Template and choose it,
 * and nothing more. The scope triple is present because a client that holds a
 * page keyed by one Area still has to prove to itself that a row belongs to it.
 * `publishedVersion` is present because it is the identity of the thing being
 * offered: two Templates with the same slug and different published versions are
 * different offers, and `APP3-B05A` will address bytes by exactly this pair.
 *
 * Absent, on purpose, from both shapes:
 *
 * - `previewDerivativeId`, and any other derivative, storage key, bucket or
 *   object URL. `APP3-B05A` owns published Template asset delivery and its route
 *   is still `TO_BE_LOCKED_AT_APP3-B05A_ENTRY_AUDIT`, so publishing a derivative
 *   id here would hand out an identifier a client can do nothing with except
 *   guess at a path — and `IMP-D044` PO-06 forbids a generic asset-by-id read
 *   precisely so that guess never works.
 * - `templateId`. The public identity of a Template is its slug: the detail read
 *   takes a slug, `APP3-B05A` will authorise from the published Template and
 *   Version chain, and a raw internal id is a value no public consumer has a use
 *   for. Withholding it costs nothing and removes a correlation handle.
 * - `status`, `createdAt`, `updatedAt`, `archivedAt`. A publicly visible Template
 *   is `PUBLISHED` by construction — the field would be a constant — and the
 *   authoring timestamps are store-operations detail.
 * - Every Admin-only and internal field: descriptions of why something is not
 *   publishable, audit reasons, actors, outbox payloads.
 *
 * The detail adds the document, and the document alone.
 */
import type {
  DesignTemplate,
  DesignTemplateVersion,
} from '../domain/repositories/design-template.repository';
import type { PublishedDesignTemplate } from '../domain/repositories/published-design-template.repository';

export interface PublicTemplateScopeView {
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface PublicTemplateVersionView {
  readonly version: number;
  readonly documentSchemaVersion: number;
  /** Always present: an unpublished version never reaches this projection. */
  readonly publishedAt: string;
}

export interface PublicTemplateSummaryView {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: PublicTemplateScopeView;
  readonly publishedVersion: PublicTemplateVersionView;
}

export interface PublicTemplateDetailView extends PublicTemplateSummaryView {
  /**
   * The canonical `APP3-P01` Design Document of the published version, exactly
   * as it was published.
   *
   * Never re-canonicalized, re-validated into a repaired form, or synthesised: a
   * published version is immutable, and a public read that "fixed" a document on
   * the way out would be answering with something the store never approved.
   */
  readonly document: unknown;
}

export interface PublicTemplateListView {
  readonly items: readonly PublicTemplateSummaryView[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

/**
 * The scope triple of a publicly visible Template.
 *
 * A `PUBLISHED` Template always holds all three — `IMP-D042` PO-07's `GRD-T01`
 * refuses to publish an incomplete scope — so this is a total function on the
 * rows this projection can ever see. The fallback is not a default; it is the
 * shape a caller would get if that invariant were ever broken, and it is
 * unreachable rather than empty-looking because the read that produces these
 * rows filters on the same three columns.
 */
function toScopeView(template: DesignTemplate): PublicTemplateScopeView {
  return {
    productId: template.productId ?? '',
    productSideId: template.productSideId ?? '',
    embroideryAreaId: template.embroideryAreaId ?? '',
  };
}

function toVersionView(version: DesignTemplateVersion): PublicTemplateVersionView {
  return {
    version: version.version,
    documentSchemaVersion: version.documentSchemaVersion,
    // `?? ''` is unreachable: the read selects on `published_at IS NOT NULL`.
    publishedAt: version.publishedAt?.toISOString() ?? '',
  };
}

export function toPublicSummaryView(row: PublishedDesignTemplate): PublicTemplateSummaryView {
  return {
    slug: row.template.slug,
    name: row.template.name,
    ...(row.template.description === undefined ? {} : { description: row.template.description }),
    scope: toScopeView(row.template),
    publishedVersion: toVersionView(row.version),
  };
}

export function toPublicDetailView(row: PublishedDesignTemplate): PublicTemplateDetailView {
  return {
    ...toPublicSummaryView(row),
    document: row.version.designDocument,
  };
}
