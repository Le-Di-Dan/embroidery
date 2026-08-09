/**
 * The seven `GRD-T01` conditions, as an **advisory** panel over an authoritative
 * server guard.
 *
 * There is no Template-readiness read operation in the contract and this
 * checkpoint does not invent one. So the panel has two truth layers, and the
 * distinction is the whole design:
 *
 * - what the current client can *prove* from reads it already performs — the
 *   Template detail (`APP3-B03`) and the Product placement (`APP3-B01`) — using
 *   the same `APP3-P01` and `APP3-P02` authorities the server calls;
 * - what it cannot prove without inventing a contract, which is reported as
 *   *checked when you publish* and never as a pass.
 *
 * A row this client cannot evaluate must never render green. The failure that
 * would cause is the one worth preventing: an operator reading seven ticks,
 * pressing publish, and being refused — having been told by their own tooling
 * that everything was fine.
 *
 * Equally, an unprovable row never **blocks**. Publish is disabled only for a
 * locally authoritative impossibility (no immutable version, incomplete scope),
 * because a client that could block on a guess would be a second, weaker GRD-T01
 * — exactly what `IMP-D042` PO-07 forbids. The POST is the final authority.
 */
import {
  prepareDesignDocument,
  readSchemaVersion,
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  type DesignDocument,
} from '@embroidery/design-document';
import {
  validateDocumentWithinEmbroideryArea,
  validatePlacementSnapshot,
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
} from '@embroidery/design-engine';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

/** The seven conditions, in the order the design lists them. */
export const READINESS_CONDITIONS = [
  'IMMUTABLE_VERSION',
  'SCOPE_COMPLETE',
  'DOCUMENT_VALID',
  'SCOPE_ACTIVE',
  'PLACEMENT_MATCHES',
  'WITHIN_AREA',
  'MEDIA_ELIGIBLE',
] as const;

export type ReadinessCondition = (typeof READINESS_CONDITIONS)[number];

/**
 * `READY` and `NOT_READY` are client-proven. `CHECKED_ON_PUBLISH` means *this
 * client cannot decide it* — either because no accepted read answers it, or
 * because an earlier condition failed and evaluating this one would require
 * assuming facts that do not hold.
 */
export type ReadinessState = 'READY' | 'NOT_READY' | 'CHECKED_ON_PUBLISH';

export interface ReadinessRow {
  readonly condition: ReadinessCondition;
  readonly state: ReadinessState;
  /** A short, bounded detail line; never a server message. */
  readonly detailKey: string;
  /** Substituted into the detail copy when the row names concrete values. */
  readonly detailValue?: string;
}

export interface ReadinessReport {
  readonly rows: readonly ReadinessRow[];
  /**
   * True only when a **locally authoritative** fact makes success impossible.
   * Never set from an unevaluated row.
   */
  readonly blocked: boolean;
  readonly provenFailures: number;
}

/** The resolved placement rows for this Template's scope, when they resolve. */
export interface ResolvedScopeAuthority {
  readonly side: PlacementAuthority;
  readonly area: EmbroideryAreaAuthority;
  readonly sideName: string;
  readonly areaName: string;
}

export interface ReadinessInput {
  readonly detail: AdminDesignTemplateDetailResponse;
  /**
   * The resolved scope chain, `null` when the placement read proved it does not
   * resolve, `undefined` while it has not been read at all — three states, not
   * two, because "not loaded yet" must not render as "retired".
   */
  readonly scope: ResolvedScopeAuthority | null | undefined;
}

const unresolved = (condition: ReadinessCondition, detailKey: string): ReadinessRow => ({
  condition,
  state: 'CHECKED_ON_PUBLISH',
  detailKey,
});

/**
 * Does this document place any Asset at all?
 *
 * The one media fact this client can prove. The server's own rule is that a
 * document referencing zero Assets is trivially eligible — *"a document that
 * places nothing places nothing ineligible"* — so answering `READY` here
 * restates an observation about the document, not a copy of the eligibility
 * policy. The moment one reference exists, derivative readiness is a fact only
 * the server can check, and the row says so.
 */
function referencesAnyAsset(document: DesignDocument): boolean {
  return document.elements.some((element) => 'assetId' in element);
}

/**
 * The panel, computed from what is actually in hand.
 *
 * Each condition is evaluated only when its precondition held, mirroring the
 * order the server evaluates them in — validating containment against an Area
 * the Template does not legitimately claim would produce an answer that means
 * nothing.
 */
export function evaluateReadiness({ detail, scope }: ReadinessInput): ReadinessReport {
  const rows: ReadinessRow[] = [];

  // 1 — an immutable version exists. Locally authoritative and blocking.
  const version = detail.currentVersion;
  const hasVersion = version !== undefined;
  rows.push({
    condition: 'IMMUTABLE_VERSION',
    state: hasVersion ? 'READY' : 'NOT_READY',
    detailKey: hasVersion ? 'versionSaved' : 'versionMissing',
    ...(hasVersion ? { detailValue: `v${String(version.version)}` } : {}),
  });

  // 2 — the complete product/side/area triple. Locally authoritative and blocking.
  const scopeComplete = detail.scope !== undefined;
  rows.push({
    condition: 'SCOPE_COMPLETE',
    state: scopeComplete ? 'READY' : 'NOT_READY',
    detailKey: scopeComplete ? 'scopePresent' : 'scopeMissing',
    ...(scopeComplete && scope != null
      ? { detailValue: `${scope.sideName} · ${scope.areaName}` }
      : {}),
  });

  // 3 — the document, under `APP3-P01` alone. There is nothing to validate
  // without a version, so the row is unevaluated rather than failed. The
  // document hangs off the *detail*, not the version summary: the projection
  // carries one canonical document, the current version's.
  const document = hasVersion ? preparedDocument(detail.document) : undefined;
  rows.push(
    hasVersion
      ? {
          condition: 'DOCUMENT_VALID',
          state: document === undefined ? 'NOT_READY' : 'READY',
          detailKey: document === undefined ? 'documentInvalid' : 'documentValid',
        }
      : unresolved('DOCUMENT_VALID', 'noVersionYet'),
  );

  // 4 — the chain still resolves and no row is retired. `undefined` is "not read
  // yet", which is not a failure.
  rows.push(
    scope === undefined
      ? unresolved('SCOPE_ACTIVE', 'scopeNotRead')
      : {
          condition: 'SCOPE_ACTIVE',
          state: scope === null ? 'NOT_READY' : 'READY',
          detailKey: scope === null ? 'scopeRetired' : 'scopeActive',
        },
  );

  // 5 / 6 — geometry, under `APP3-P02` in the same `NEW_EDITING` mode the server
  // uses. Both need a valid document *and* a resolved chain.
  const geometryReady = document !== undefined && scope != null;
  if (!geometryReady) {
    rows.push(unresolved('PLACEMENT_MATCHES', 'geometryNotEvaluable'));
    rows.push(unresolved('WITHIN_AREA', 'geometryNotEvaluable'));
  } else {
    const placementOk = validatePlacementSnapshot(
      document.placement,
      scope.side,
      scope.area,
      'NEW_EDITING',
    ).ok;
    rows.push({
      condition: 'PLACEMENT_MATCHES',
      state: placementOk ? 'READY' : 'NOT_READY',
      detailKey: placementOk ? 'placementMatches' : 'placementMismatch',
    });
    // Containment is only meaningful once the placement agrees with the Area.
    rows.push(
      placementOk
        ? {
            condition: 'WITHIN_AREA',
            state: validateDocumentWithinEmbroideryArea(document, scope.area).ok
              ? 'READY'
              : 'NOT_READY',
            detailKey: validateDocumentWithinEmbroideryArea(document, scope.area).ok
              ? 'withinArea'
              : 'outOfBounds',
          }
        : unresolved('WITHIN_AREA', 'geometryNotEvaluable'),
    );
  }

  // 7 — media. Provable only in the negative case: no references, nothing to be
  // ineligible. Otherwise the server decides and the row says so.
  rows.push(
    document === undefined
      ? unresolved('MEDIA_ELIGIBLE', 'noVersionYet')
      : referencesAnyAsset(document)
        ? unresolved('MEDIA_ELIGIBLE', 'mediaCheckedOnPublish')
        : { condition: 'MEDIA_ELIGIBLE', state: 'READY', detailKey: 'mediaNoneReferenced' },
  );

  // Only the two locally authoritative conditions may disable the command.
  const blocked = rows.some(
    (row) =>
      row.state === 'NOT_READY' &&
      (row.condition === 'IMMUTABLE_VERSION' || row.condition === 'SCOPE_COMPLETE'),
  );

  return {
    rows,
    blocked,
    provenFailures: rows.filter((row) => row.state === 'NOT_READY').length,
  };
}

/**
 * The document as `APP3-P01` accepts it, or nothing.
 *
 * Both the schema-version gate and the structural preparation, in the server's
 * order — a document at an unsupported schema version is invalid regardless of
 * how well formed it looks. The prepared value is used for geometry only and is
 * never written back anywhere: the version is immutable.
 */
function preparedDocument(raw: unknown): DesignDocument | undefined {
  const schemaVersion = readSchemaVersion(raw);
  if (!schemaVersion.ok || schemaVersion.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
    return undefined;
  }
  const prepared = prepareDesignDocument(raw);
  return prepared.ok ? prepared.value.document : undefined;
}
