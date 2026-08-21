/**
 * Structural validation of an untrusted payload into a `DesignDocument`.
 *
 * The schema version is checked *first* and on its own. A payload written by a
 * newer build may be shaped in ways this build would misread rather than
 * reject, so "unknown version" has to fail before any field is interpreted —
 * ADR-DB1-012 §5's backward-read policy is about reading old versions
 * deliberately, never about guessing at new ones.
 */
import {
  BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS,
} from '../schema/constants';
import type { DesignDocument, DesignPlacementSnapshot } from '../schema/document';
import type { DesignElement } from '../schema/elements';
import {
  failed,
  finding,
  ok,
  type DesignDocumentFinding,
  type DesignDocumentResult,
} from '../findings/finding';
import { readElement } from './element';
import { validateGroupGraph } from './groups';
import {
  FindingCollector,
  isPlainObject,
  rejectUnknownKeys,
  requirePositive,
  requirePositiveInteger,
  requireString,
} from './primitives';

const ROOT_KEYS = ['schemaVersion', 'placement', 'elements'];
const PLACEMENT_KEYS = [
  'productSideId',
  'embroideryAreaId',
  'canvasWidthPx',
  'canvasHeightPx',
  'physicalWidthMm',
  'physicalHeightMm',
  'pxPerMm',
];

/** Reads and checks only the version, so an unknown one fails loudly and alone. */
export function readSchemaVersion(payload: unknown): DesignDocumentResult<number> {
  if (!isPlainObject(payload)) {
    return failed([finding('INVALID_DOCUMENT', '$', 'The document must be a JSON object.')]);
  }
  const version = payload.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return failed([
      finding(
        'UNSUPPORTED_SCHEMA_VERSION',
        '$.schemaVersion',
        'The document does not declare an integer schema version.',
      ),
    ]);
  }
  if (!SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS.includes(version)) {
    return failed([
      finding(
        'UNSUPPORTED_SCHEMA_VERSION',
        '$.schemaVersion',
        'This build cannot read that document schema version.',
        { declared: version, current: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION },
      ),
    ]);
  }
  return ok(version);
}

/**
 * Reads one placement identity under the rules of the declared schema version.
 *
 * v1 has exactly one rule and it is the rule it shipped with: a required
 * non-empty NFC string. `requireString` is called unchanged, so no v1 payload
 * takes a different path through this function than it did before `APP6-B08` —
 * that is what "v1 semantics are byte-for-byte authoritative" has to mean in
 * code, and it is why the version is a branch here rather than a relaxed check.
 *
 * From v2 the same field additionally admits explicit `null`. `undefined` and a
 * missing key are **not** null: absence has to be written down
 * (`ADR-APP6-001` §3.4), so a document that simply omits the field is as
 * malformed at v2 as it is at v1.
 */
function readPlacementId(
  raw: Record<string, unknown>,
  key: string,
  at: string,
  version: number,
  collector: FindingCollector,
): string | null | undefined {
  if (version < BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
    return requireString(raw, key, at, collector);
  }
  if (raw[key] === null) return null;
  return requireString(raw, key, at, collector);
}

function readPlacement(
  payload: Record<string, unknown>,
  version: number,
  collector: FindingCollector,
): DesignPlacementSnapshot | undefined {
  const raw = payload.placement;
  if (!isPlainObject(raw)) {
    collector.invalid('$.placement', '"placement" must be an object.');
    return undefined;
  }
  rejectUnknownKeys(raw, PLACEMENT_KEYS, '$.placement', collector);

  const at = '$.placement';
  const productSideId = readPlacementId(raw, 'productSideId', at, version, collector);
  const embroideryAreaId = readPlacementId(raw, 'embroideryAreaId', at, version, collector);

  // The pair is the branch (`ADR-APP6-001` §3.2/§3.4): both ids present is
  // Catalog, both absent is a customer-owned product, and one of each is neither.
  // A half-null placement is not a stricter record, it is an unanswerable one —
  // the same argument CST-129 makes in SQL about the row this document is
  // authored onto, made here about the document itself, so the two can never
  // disagree about which branch a version is on.
  if (
    (productSideId === null && typeof embroideryAreaId === 'string') ||
    (embroideryAreaId === null && typeof productSideId === 'string')
  ) {
    collector.invalid(
      at,
      '"productSideId" and "embroideryAreaId" must both name a placement or both be null.',
    );
    return undefined;
  }

  const canvasWidthPx = requirePositiveInteger(raw, 'canvasWidthPx', at, collector);
  const canvasHeightPx = requirePositiveInteger(raw, 'canvasHeightPx', at, collector);
  const physicalWidthMm = requirePositive(raw, 'physicalWidthMm', at, collector);
  const physicalHeightMm = requirePositive(raw, 'physicalHeightMm', at, collector);
  const pxPerMm = requirePositive(raw, 'pxPerMm', at, collector);

  if (
    productSideId === undefined ||
    embroideryAreaId === undefined ||
    canvasWidthPx === undefined ||
    canvasHeightPx === undefined ||
    physicalWidthMm === undefined ||
    physicalHeightMm === undefined ||
    pxPerMm === undefined
  ) {
    return undefined;
  }
  // Whether these numbers agree with each other, or with the real Product Side,
  // is geometry — `APP3-P02` and the placement APIs own that comparison.
  return {
    productSideId,
    embroideryAreaId,
    canvasWidthPx,
    canvasHeightPx,
    physicalWidthMm,
    physicalHeightMm,
    pxPerMm,
  };
}

function readElements(
  payload: Record<string, unknown>,
  collector: FindingCollector,
): readonly DesignElement[] | undefined {
  const raw = payload.elements;
  if (!Array.isArray(raw)) {
    collector.invalid('$.elements', '"elements" must be an array in z-order.');
    return undefined;
  }
  const elements: DesignElement[] = [];
  const seen = new Set<string>();
  let broken = false;

  for (const [index, candidate] of raw.entries()) {
    const element = readElement(candidate, `$.elements[${String(index)}]`, collector);
    if (element === undefined) {
      broken = true;
      continue;
    }
    if (seen.has(element.id)) {
      collector.add(
        finding(
          'DUPLICATE_ELEMENT_ID',
          `$.elements[${String(index)}].id`,
          'Element ids must be unique across the document.',
        ),
      );
      broken = true;
      continue;
    }
    seen.add(element.id);
    elements.push(element);
  }
  return broken ? undefined : elements;
}

/**
 * Validates a payload and returns a **fresh** normalized document.
 *
 * The input is never mutated and never returned: everything handed back was
 * rebuilt field by field from values this function checked.
 */
export function validateDesignDocumentStructure(
  payload: unknown,
): DesignDocumentResult<DesignDocument> {
  const version = readSchemaVersion(payload);
  if (!version.ok) return version;

  // `readSchemaVersion` already proved this is a plain object.
  const source = payload as Record<string, unknown>;
  const collector = new FindingCollector();
  rejectUnknownKeys(source, ROOT_KEYS, '$', collector);

  const placement = readPlacement(source, version.value, collector);
  const elements = readElements(source, collector);

  if (placement === undefined || elements === undefined) {
    return failed(collector.findings);
  }

  const graph: readonly DesignDocumentFinding[] = validateGroupGraph(elements);
  if (graph.length > 0) {
    return failed([...collector.findings, ...graph]);
  }
  if (!collector.empty) {
    return failed(collector.findings);
  }
  return ok({ schemaVersion: version.value, placement, elements });
}
