/**
 * Reading a persisted inspection detail back (APP2-W01 §18).
 *
 * The write side lives in `inspection-detail.ts`; this is the read side, and it
 * is deliberately paranoid. A terminal replay must prove the *existing* record
 * is a valid V1 document before it declares the job already done — an
 * unreadable, foreign-schema or half-shaped detail is a contradiction to stop
 * on, not something to overwrite. So every field is re-validated as if it came
 * from a stranger, because after a schema change or a manual edit it did.
 *
 * Returns `undefined` for anything it cannot fully validate. There is no
 * partial parse and no coercion.
 */
import { ASSET_PROCESSING_POLICY_VERSION, DERIVATIVE_KINDS } from './asset-processing-policy';
import type {
  CatalogDerivativeKind,
  ProcessableFormat,
  ProcessableMediaType,
} from './asset-processing-policy';
import {
  INSPECTION_DETAIL_SCHEMA_VERSION,
  MAX_INSPECTION_DETAIL_BYTES,
  type AcceptedInspectionDetail,
  type InspectedDerivative,
  type InspectedSource,
  type InspectionDetail,
  type RejectedInspectionDetail,
} from './inspection-detail';
import { isAssetRejectionCode } from './processing-rejection';

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;

interface ProcessorValue {
  readonly name: string;
  readonly version: string;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value > 0 && Number.isFinite(value)
  );
}

function isChecksum(value: unknown): value is string {
  return typeof value === 'string' && CHECKSUM_PATTERN.test(value);
}

export function decodeInspectionDetail(raw: string | null): InspectionDetail | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_INSPECTION_DETAIL_BYTES) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  if (
    record['schemaVersion'] !== INSPECTION_DETAIL_SCHEMA_VERSION ||
    record['policyVersion'] !== ASSET_PROCESSING_POLICY_VERSION
  ) {
    return undefined;
  }
  const processorValue = decodeProcessor(record['processor']);
  if (processorValue === undefined) {
    return undefined;
  }

  if (record['result'] === 'REJECTED') {
    return decodeRejected(record, processorValue);
  }
  if (record['result'] === 'ACCEPTED') {
    return decodeAccepted(record, processorValue);
  }
  return undefined;
}

function decodeProcessor(value: unknown): ProcessorValue | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { name, version } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof version !== 'string') {
    return undefined;
  }
  return { name, version };
}

function decodeRejected(
  record: Record<string, unknown>,
  processor: ProcessorValue,
): RejectedInspectionDetail | undefined {
  const code = record['rejectionCode'];
  const cleanupPending = record['cleanupPending'];
  if (typeof code !== 'string' || !isAssetRejectionCode(code)) {
    return undefined;
  }
  if (typeof cleanupPending !== 'boolean') {
    return undefined;
  }
  return {
    schemaVersion: INSPECTION_DETAIL_SCHEMA_VERSION,
    policyVersion: ASSET_PROCESSING_POLICY_VERSION,
    processor,
    result: 'REJECTED',
    rejectionCode: code,
    cleanupPending,
  };
}

function decodeAccepted(
  record: Record<string, unknown>,
  processor: ProcessorValue,
): AcceptedInspectionDetail | undefined {
  const source = decodeSource(record['source']);
  const derivatives = decodeDerivatives(record['derivatives']);
  if (source === undefined || derivatives === undefined) {
    return undefined;
  }
  return {
    schemaVersion: INSPECTION_DETAIL_SCHEMA_VERSION,
    policyVersion: ASSET_PROCESSING_POLICY_VERSION,
    processor,
    result: 'ACCEPTED',
    source,
    derivatives,
  };
}

const SOURCE_INTEGER_FIELDS = [
  'byteSize',
  'width',
  'height',
  'orientedWidth',
  'orientedHeight',
  'channels',
];

function decodeSource(value: unknown): InspectedSource | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!SOURCE_INTEGER_FIELDS.every((field) => isPositiveInteger(record[field]))) {
    return undefined;
  }
  // Not "<= 1": a document claiming an animated source was never a valid
  // accepted record, so re-reading one is a contradiction rather than a replay.
  if (record['pages'] !== 1) {
    return undefined;
  }
  if (typeof record['mediaType'] !== 'string' || typeof record['format'] !== 'string') {
    return undefined;
  }
  if (!isChecksum(record['checksum'])) {
    return undefined;
  }
  return {
    mediaType: record['mediaType'] as ProcessableMediaType,
    format: record['format'] as ProcessableFormat,
    byteSize: record['byteSize'] as number,
    checksum: record['checksum'],
    width: record['width'] as number,
    height: record['height'] as number,
    orientedWidth: record['orientedWidth'] as number,
    orientedHeight: record['orientedHeight'] as number,
    channels: record['channels'] as number,
    pages: 1,
  };
}

function decodeDerivatives(value: unknown): readonly InspectedDerivative[] | undefined {
  if (!Array.isArray(value) || value.length !== DERIVATIVE_KINDS.length) {
    return undefined;
  }
  const decoded: InspectedDerivative[] = [];
  for (const entry of value as unknown[]) {
    const derivative = decodeDerivative(entry);
    if (derivative === undefined) {
      return undefined;
    }
    decoded.push(derivative);
  }
  // Exactly one entry per canonical kind — a document with two thumbnails and
  // no preview would otherwise pass the length check.
  const kinds = new Set(decoded.map((entry) => entry.kind));
  return kinds.size === DERIVATIVE_KINDS.length ? decoded : undefined;
}

function decodeDerivative(entry: unknown): InspectedDerivative | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const kind = record['kind'];
  if (
    typeof kind !== 'string' ||
    !(DERIVATIVE_KINDS as readonly string[]).includes(kind) ||
    record['mediaType'] !== 'image/webp' ||
    record['isWatermarked'] !== false ||
    !isPositiveInteger(record['width']) ||
    !isPositiveInteger(record['height']) ||
    !isPositiveInteger(record['byteSize']) ||
    !isChecksum(record['checksum'])
  ) {
    return undefined;
  }
  return {
    kind: kind as CatalogDerivativeKind,
    mediaType: 'image/webp',
    width: record['width'],
    height: record['height'],
    byteSize: record['byteSize'],
    checksum: record['checksum'],
    isWatermarked: false,
  };
}
