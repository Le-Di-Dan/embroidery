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

function readPlacement(
  payload: Record<string, unknown>,
  collector: FindingCollector,
): DesignPlacementSnapshot | undefined {
  const raw = payload.placement;
  if (!isPlainObject(raw)) {
    collector.invalid('$.placement', '"placement" must be an object.');
    return undefined;
  }
  rejectUnknownKeys(raw, PLACEMENT_KEYS, '$.placement', collector);

  const at = '$.placement';
  const productSideId = requireString(raw, 'productSideId', at, collector);
  const embroideryAreaId = requireString(raw, 'embroideryAreaId', at, collector);
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

  const placement = readPlacement(source, collector);
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
