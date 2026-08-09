/**
 * Turning the two server reads into the one thing the editor can be opened on.
 *
 * A pure function, so every branch below is provable without rendering anything
 * — which matters because the branches encode contract facts rather than
 * presentation choices.
 *
 * ## Where a document comes from
 *
 * A Template with a current version already has one: `APP3-B03A` returns the
 * canonical document, and it is run through `APP3-P01`'s validator rather than
 * trusted, so a document this build cannot read is reported instead of rendered
 * half-way.
 *
 * A Template with **no** version has none, and one has to be constructed. That
 * needs a placement snapshot, which needs a resolved Product Side — see
 * `editor-document.ts` for why the alternative is fabricating ids.
 *
 * ## Why an unresolved scope is not always fatal
 *
 * If the Template already has a document, the document carries its own placement
 * snapshot, so the stage still has a coordinate space and the draft is still the
 * operator's to keep. Only the *context* — the area rectangle, the safe boundary
 * and the artwork — is missing, and the screen says so. Losing an existing draft
 * because a Side was retired would be the more destructive answer.
 *
 * For a Template with no version there is no such fallback: without the Side
 * there is no canvas, and there is nothing to author on.
 */
import { validateDesignDocumentStructure, type DesignDocument } from '@embroidery/design-document';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { buildEmptyDocument } from './editor-document';
import { resolveTemplateScope, type ResolvedTemplateScope } from './editor-scope';
import type { TemplatePlacementQuery } from '../hooks/use-template-placement-query';

/** The status this screen may edit. Everything else is presented read-only. */
export const EDITABLE_TEMPLATE_STATUS = 'DRAFT';

/** `expectedCurrentVersion` for a Template that has never been saved. */
export const UNVERSIONED_EXPECTED_VERSION = 0;

export type EditorSource =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'load-failed' }
  /**
   * Unscoped, and `APP3-B03B` would accept an initial assignment: a `DRAFT`
   * with no version at all. This is the only state that shows the selector.
   */
  | { readonly kind: 'scope-assignable' }
  /**
   * Unscoped and **not** assignable — versioned, or no longer a `DRAFT`.
   *
   * A real state rather than an impossible one: `APP3-B03A` requires a
   * placement snapshot to save, so a versioned unscoped Template cannot be
   * produced by any current path, but a lifecycle transition on a scopeless
   * draft can still leave one. It has no representable document and no way to
   * acquire a scope, so it is reported and nothing is fetched for it.
   */
  | { readonly kind: 'unscoped' }
  | { readonly kind: 'scope-failed' }
  /** The scope names rows the Product no longer has, and there is no document. */
  | { readonly kind: 'scope-unresolved' }
  /** `APP3-P01` refused the document the server returned, or the empty one. */
  | { readonly kind: 'document-invalid' }
  | {
      readonly kind: 'ready';
      readonly version: number;
      readonly document: DesignDocument;
      /** `null` when the context could not be resolved; the draft survives. */
      readonly scope: ResolvedTemplateScope | null;
      readonly editable: boolean;
    };

/**
 * Whether `APP3-B03B` would accept an initial scope assignment for this
 * Template.
 *
 * All three conditions, because the server checks all three: no scope, still a
 * `DRAFT`, and no version. `currentVersion` is an optional object precisely so
 * "no version" is not a version zero, so its absence is the check — never a
 * comparison against `0`, which the detail view does not publish.
 */
export function isInitiallyAssignable(detail: AdminDesignTemplateDetailResponse): boolean {
  return (
    detail.scope === undefined &&
    detail.status === EDITABLE_TEMPLATE_STATUS &&
    detail.currentVersion === undefined
  );
}

export interface EditorSourceInput {
  readonly detail: AdminDesignTemplateDetailResponse | undefined;
  readonly detailLoading: boolean;
  readonly detailFailure: 'not-found' | 'generic' | null;
  readonly placement: TemplatePlacementQuery;
}

export function resolveEditorSource({
  detail,
  detailLoading,
  detailFailure,
  placement,
}: EditorSourceInput): EditorSource {
  if (detailFailure === 'not-found') return { kind: 'not-found' };
  if (detailFailure === 'generic') return { kind: 'load-failed' };
  if (detailLoading || detail === undefined) return { kind: 'loading' };

  const editable = detail.status === EDITABLE_TEMPLATE_STATUS;
  const scopeRef = detail.scope;

  if (scopeRef === undefined) {
    // `APP3-B03B`'s source-state rule, restated exactly: only an unscoped,
    // versionless `DRAFT` may be assigned. Anything else unscoped is a dead end
    // the server would refuse, so the selector is not offered — showing it would
    // be offering a choice whose only outcome is a `409`.
    return isInitiallyAssignable(detail) ? { kind: 'scope-assignable' } : { kind: 'unscoped' };
  }
  if (placement.isLoading) return { kind: 'loading' };
  if (placement.failed || placement.placement === undefined) return { kind: 'scope-failed' };

  const resolution = resolveTemplateScope(scopeRef, placement.placement);
  const scope = resolution.kind === 'resolved' ? resolution.scope : null;

  const rebuilt = rebuildDocument(detail, scope);
  if (rebuilt.kind === 'invalid') return { kind: 'document-invalid' };
  if (rebuilt.kind === 'needs-scope') return { kind: 'scope-unresolved' };

  return {
    kind: 'ready',
    version: rebuilt.version,
    document: rebuilt.document,
    scope,
    editable,
  };
}

export type RebuiltDocument =
  | { readonly kind: 'ok'; readonly version: number; readonly document: DesignDocument }
  | { readonly kind: 'invalid' }
  /** No version to read and no resolved Side to construct a placement from. */
  | { readonly kind: 'needs-scope' };

/**
 * The document and the version a detail response implies.
 *
 * Shared by the initial load and by the conflict reload, so "what the server
 * currently holds" is computed one way. A second derivation is how a reload ends
 * up rebasing onto a version the initial load would have read differently.
 */
export function rebuildDocument(
  detail: AdminDesignTemplateDetailResponse,
  scope: ResolvedTemplateScope | null,
): RebuiltDocument {
  const serverDocument = detail.document;
  if (serverDocument !== undefined) {
    // Validated, not trusted. A document this build cannot read must be reported
    // rather than partially rendered — half a stage is worse than a clear
    // refusal, because the operator would author against it.
    const parsed = validateDesignDocumentStructure(serverDocument);
    if (!parsed.ok) return { kind: 'invalid' };
    return {
      kind: 'ok',
      version: detail.currentVersion?.version ?? UNVERSIONED_EXPECTED_VERSION,
      document: parsed.value,
    };
  }

  if (scope === null) return { kind: 'needs-scope' };

  const empty = buildEmptyDocument(scope);
  if (!empty.ok) return { kind: 'invalid' };
  return {
    kind: 'ok',
    // Never a fabricated `1`. Zero is what the contract asks for and what the
    // server turns into the first version.
    version: UNVERSIONED_EXPECTED_VERSION,
    document: empty.value,
  };
}
