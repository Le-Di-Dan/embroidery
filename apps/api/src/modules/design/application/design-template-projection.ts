/**
 * The runtime shape the Admin Design Template operations answer with
 * (`APP3-B03`).
 *
 * Kept apart from the OpenAPI classes in `presentation/schemas` on purpose:
 * adding a field to one and forgetting the other becomes a type error instead of
 * a silently undocumented field.
 *
 * The interesting decision here is `currentVersion`. `design_templates` carries
 * an integer counter that is `0` for a header `APP3-B03` has just created, and
 * `0` is not a version — it is the absence of one. Publishing it as a number
 * would make every consumer guess whether `0` means "unversioned" or "version
 * zero", so the projection answers with an **optional object** that is simply
 * absent until `APP3-B03A` writes the first version. There is no version 0.
 */
import type {
  DesignTemplate,
  DesignTemplateVersion,
} from '../domain/repositories/design-template.repository';

export interface TemplateScopeView {
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface TemplateVersionView {
  readonly version: number;
  readonly documentSchemaVersion: number;
  readonly createdAt: string;
  /** Absent while the version is an unpublished draft version. */
  readonly publishedAt?: string;
}

export interface TemplateSummaryView {
  readonly templateId: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scope?: TemplateScopeView;
  readonly currentVersion?: TemplateVersionView;
  readonly archivedAt?: string;
}

export interface TemplateDetailView extends TemplateSummaryView {
  readonly description?: string;
  /**
   * The canonical Design Document of the current version, when one exists.
   *
   * Never synthesised: a header with no version carries no document at all
   * rather than an empty one, because an empty document is a valid document and
   * a consumer could not tell the two apart.
   */
  readonly document?: unknown;
}

export interface TemplateListView {
  readonly items: readonly TemplateSummaryView[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

/** The scope triple, or nothing — the three columns move together (PO-06). */
function toScopeView(template: DesignTemplate): TemplateScopeView | undefined {
  if (
    template.productId === undefined ||
    template.productSideId === undefined ||
    template.embroideryAreaId === undefined
  ) {
    return undefined;
  }
  return {
    productId: template.productId,
    productSideId: template.productSideId,
    embroideryAreaId: template.embroideryAreaId,
  };
}

function toVersionView(version: DesignTemplateVersion): TemplateVersionView {
  return {
    version: version.version,
    documentSchemaVersion: version.documentSchemaVersion,
    createdAt: version.createdAt.toISOString(),
    ...(version.publishedAt === undefined
      ? {}
      : { publishedAt: version.publishedAt.toISOString() }),
  };
}

export function toSummaryView(
  template: DesignTemplate,
  version: DesignTemplateVersion | undefined,
): TemplateSummaryView {
  const scope = toScopeView(template);
  return {
    templateId: template.id,
    name: template.name,
    slug: template.slug,
    status: template.status,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    ...(scope === undefined ? {} : { scope }),
    ...(version === undefined ? {} : { currentVersion: toVersionView(version) }),
    ...(template.archivedAt === undefined ? {} : { archivedAt: template.archivedAt.toISOString() }),
  };
}

export function toDetailView(
  template: DesignTemplate,
  version: DesignTemplateVersion | undefined,
): TemplateDetailView {
  return {
    ...toSummaryView(template, version),
    ...(template.description === undefined ? {} : { description: template.description }),
    ...(version === undefined ? {} : { document: version.designDocument }),
  };
}
