/**
 * The Studio snapshot both Session operations return (`APP3-B07` §11).
 *
 * Sufficient for the first render without a second call: the document, the
 * schema version that governs it, the revision an autosave must present, and
 * the placement geometry the canvas needs.
 *
 * What is absent is the contract. No secret, no digest, no pepper, no cookie, no
 * storage identity, no private Template Version id, no customer identity and no
 * Audit metadata. The Side and Area ids that do appear are the same ones
 * `/api/public/products/{slug}/placement` already publishes — they are public
 * identifiers, not internal ones, and the canonical document's placement
 * snapshot is defined in terms of them.
 */
import type { DesignSession } from '../domain/repositories/design-session.repository';

export interface DesignSessionScopeView {
  readonly productSlug: string;
  readonly sideCode: string;
  readonly areaCode: string;
  /** Canvas geometry — the sole px↔mm authority for this Side. */
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
  /** The Area the design must stay inside, in canvas pixels. */
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
}

/** Lineage only. A slug and an integer stamp — never the private Version row id. */
export interface DesignSessionLineageView {
  readonly templateSlug: string;
  readonly templateVersion: number;
}

export interface DesignSessionSnapshotView {
  readonly sessionId: string;
  readonly status: string;
  readonly revision: number;
  readonly expiresAt: string;
  readonly documentSchemaVersion: number;
  readonly document: unknown;
  /**
   * Present on bootstrap, absent on resume.
   *
   * Bootstrap resolves the placement from the public slug and codes the caller
   * supplied, so it has the manifest in hand. Resume knows only internal row
   * ids, and the public catalog exposes no by-id placement read — adding one
   * would be new SQL in a module `APP3-B07` may not touch. A resuming Studio
   * still has the canvas geometry inside the document's own placement snapshot;
   * the safe-area bounds come from the placement manifest it already fetches.
   */
  readonly scope?: DesignSessionScopeView | undefined;
  readonly lineage?: DesignSessionLineageView | undefined;
}

export function toSessionSnapshot(
  session: DesignSession,
  scope: DesignSessionScopeView | undefined,
  lineage: DesignSessionLineageView | undefined,
): DesignSessionSnapshotView {
  return {
    sessionId: session.id,
    status: session.status,
    revision: session.autosaveRevision,
    expiresAt: session.expiresAt.toISOString(),
    documentSchemaVersion: session.documentSchemaVersion,
    document: session.designDocument,
    ...(scope === undefined ? {} : { scope }),
    ...(lineage === undefined ? {} : { lineage }),
  };
}
