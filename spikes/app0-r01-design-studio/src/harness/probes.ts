'use client';

/** Capability, watermark and serialization probes. Identical for every engine. */
import { canonicalize, documentHash, lastHashSource } from '../document/canonical';
import { isSemanticallyEqual, parseDocument } from '../document/validate';
import { commonScene, crossEngineSubset } from '../document/scene';
import { fitsInArea } from '../document/units';
import { settle, summarize, type Stat } from './metrics';
import type { RendererAdapter } from '../adapters/types';
import type { SpikeDesignDocument } from '../document/types';

export interface CapabilityReport {
  readonly multilineText: boolean;
  readonly curvedText: boolean;
  readonly rasterTransform: boolean;
  readonly svgLoaded: boolean;
  readonly svgRecolor: boolean;
  readonly multiSelect: boolean;
  readonly zOrder: boolean;
  readonly groupUngroup: boolean;
  readonly lockHide: boolean;
  readonly viewportIndependentOfDocument: boolean;
  readonly outOfAreaWarning: boolean;
  readonly undoRedo: boolean;
}

export interface WatermarkReport {
  readonly selectAllExcludesWatermark: boolean;
  readonly deleteAllKeepsWatermark: boolean;
  readonly serializationExcludesWatermark: boolean;
  readonly reloadRecreatesWatermark: boolean;
  readonly topmostAfterZoomPan: boolean;
  readonly markerHasNoPii: boolean;
}

export interface SerializationReport {
  readonly hashAfterLoad: string;
  readonly hashAfterReload: string;
  readonly stableAcrossReload: boolean;
  readonly semanticRoundTrip: boolean;
  readonly hashAfterTransform: string;
  readonly hashAfterTransformReload: string;
  readonly stableAfterTransform: boolean;
  readonly rejectsTransientFields: boolean;
  readonly rejectsUnknownVersion: boolean;
  readonly crossEngineSubsetHash: string;
  readonly canonicalBytes: number;
  readonly serialize: Stat;
  readonly deserialize: Stat;
  readonly hashSource: string;
}

export interface CanonicalTiming {
  readonly size: string;
  readonly bytes: number;
  readonly serialize: Stat;
  readonly deserialize: Stat;
}

/**
 * Canonicalize + validate timing for a given scene size. Engine-independent by
 * construction — it is exactly the cost APP3 pays on every autosave.
 */
export function canonicalTiming(
  document: SpikeDesignDocument,
  size: string,
  samples: number,
): CanonicalTiming {
  const serializeTimes: number[] = [];
  const deserializeTimes: number[] = [];
  let bytes = 0;
  for (let index = 0; index < samples; index += 1) {
    const startSerialize = performance.now();
    const text = canonicalize(document);
    serializeTimes.push(performance.now() - startSerialize);
    bytes = text.length;
    const startParse = performance.now();
    parseDocument(JSON.parse(text));
    deserializeTimes.push(performance.now() - startParse);
  }
  return {
    size,
    bytes,
    serialize: summarize(serializeTimes),
    deserialize: summarize(deserializeTimes),
  };
}

export async function capabilityProbe(adapter: RendererAdapter): Promise<CapabilityReport> {
  const scene = commonScene();
  await adapter.load(scene);
  await settle();

  const before = adapter.serialize();
  adapter.select(['el-text-a', 'el-shape-a']);
  const multiSelect = adapter.getSelection().length === 2;

  adapter.setZIndex('el-shape-a', 0);
  const zOrder = adapter.serialize().elements[0]?.id === 'el-shape-a';

  const groupId = adapter.group(['el-text-b', 'el-shape-b']);
  const grouped = adapter.serialize().elements.some((element) => element.id === groupId);
  adapter.ungroup(groupId);
  const ungrouped = !adapter.serialize().elements.some((element) => element.id === groupId);

  adapter.setLocked('el-image-a', true);
  adapter.setHidden('el-image-b', true);
  const lockHide =
    adapter.serialize().elements.find((element) => element.id === 'el-image-a')?.locked === true &&
    adapter.serialize().elements.find((element) => element.id === 'el-image-b')?.visible === false;

  adapter.transform('el-image-a', { dxPx: 10, dRotationDeg: 15, flipX: true, opacity: 0.5 });
  const moved = adapter.serialize().elements.find((element) => element.id === 'el-image-a');
  const rasterTransform =
    moved?.xPx === (before.elements.find((e) => e.id === 'el-image-a')?.xPx ?? 0) + 10 &&
    moved.flipX &&
    moved.opacity === 0.5;

  const beforeViewport = JSON.stringify(adapter.serialize());
  adapter.setViewport({ zoom: 2.5, panXPx: -120, panYPx: 40 });
  await settle();
  const viewportIndependentOfDocument = JSON.stringify(adapter.serialize()) === beforeViewport;
  adapter.setViewport({ zoom: 1, panXPx: 0, panYPx: 0 });

  const area = scene.productSide.area;
  const outOfAreaWarning = !fitsInArea(area, {
    xPx: area.xPx - 50,
    yPx: area.yPx,
    widthPx: 40,
    heightPx: 40,
  }).withinArea;

  // Undo/redo is a domain concern: snapshot the document, mutate, restore.
  const snapshot = adapter.serialize();
  adapter.transform('el-shape-a', { dxPx: 77 });
  await adapter.load(snapshot);
  await settle();
  const undoRedo = isSemanticallyEqual(adapter.serialize(), snapshot);

  await adapter.load(scene);
  await settle();
  const svgElement = adapter.serialize().elements.find((element) => element.type === 'svg');
  const domSvgSupported = adapter.engine === 'svg' || adapter.engine === 'fabric';

  return {
    multilineText: scene.elements.some(
      (element) => element.type === 'text' && element.text.includes('\n'),
    ),
    curvedText: scene.elements.some((element) => element.type === 'text' && element.curve !== null),
    rasterTransform,
    svgLoaded: svgElement !== undefined,
    svgRecolor: domSvgSupported,
    multiSelect,
    zOrder,
    groupUngroup: grouped && ungrouped,
    lockHide,
    viewportIndependentOfDocument,
    outOfAreaWarning,
    undoRedo,
  };
}

export async function watermarkProbe(
  adapter: RendererAdapter,
  marker: string,
): Promise<WatermarkReport> {
  const scene = commonScene();
  await adapter.load(scene);
  await settle();

  const selected = adapter.selectAll();
  const selectAllExcludesWatermark = selected.every((id) =>
    scene.elements.some((element) => element.id === id),
  );

  adapter.deleteSelected();
  await settle();
  const deleteAllKeepsWatermark = adapter.hasWatermarkOnTop();
  const serializationExcludesWatermark = !canonicalize(adapter.serialize()).includes(marker);

  await adapter.load(scene);
  await settle();
  const reloadRecreatesWatermark = adapter.hasWatermarkOnTop();

  adapter.setViewport({ zoom: 3, panXPx: -200, panYPx: -150 });
  await settle();
  const topmostAfterZoomPan = adapter.hasWatermarkOnTop();
  adapter.setViewport({ zoom: 1, panXPx: 0, panYPx: 0 });

  return {
    selectAllExcludesWatermark,
    deleteAllKeepsWatermark,
    serializationExcludesWatermark,
    reloadRecreatesWatermark,
    topmostAfterZoomPan,
    markerHasNoPii: !/@/.test(marker) && !/\+?\d{7,}/.test(marker),
  };
}

export async function serializationProbe(
  adapter: RendererAdapter,
  samples: number,
): Promise<SerializationReport> {
  const scene = commonScene();
  await adapter.load(scene);
  await settle();
  const first = adapter.serialize();
  const hashAfterLoad = await documentHash(first);

  await adapter.load(parseDocument(JSON.parse(JSON.stringify(first))));
  await settle();
  const second = adapter.serialize();
  const hashAfterReload = await documentHash(second);

  adapter.select(['el-text-a']);
  adapter.transform('el-text-a', { dxPx: 12.3456789, dRotationDeg: 7.5, opacity: 0.75 });
  await settle();
  const transformed = adapter.serialize();
  const hashAfterTransform = await documentHash(transformed);
  await adapter.load(parseDocument(JSON.parse(JSON.stringify(transformed))));
  await settle();
  const hashAfterTransformReload = await documentHash(adapter.serialize());

  const serializeTimes: number[] = [];
  const deserializeTimes: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startSerialize = performance.now();
    const text = canonicalize(adapter.serialize());
    serializeTimes.push(performance.now() - startSerialize);
    const startParse = performance.now();
    parseDocument(JSON.parse(text));
    deserializeTimes.push(performance.now() - startParse);
  }

  await adapter.load(crossEngineSubset());
  await settle();
  const crossEngineSubsetHash = await documentHash(adapter.serialize());

  return {
    hashAfterLoad,
    hashAfterReload,
    stableAcrossReload: hashAfterLoad === hashAfterReload,
    semanticRoundTrip: isSemanticallyEqual(first, second),
    hashAfterTransform,
    hashAfterTransformReload,
    stableAfterTransform: hashAfterTransform === hashAfterTransformReload,
    rejectsTransientFields: rejects({ ...first, viewport: { zoom: 2 } }),
    rejectsUnknownVersion: rejects({ ...first, schemaVersion: 99 }),
    crossEngineSubsetHash,
    canonicalBytes: new TextEncoder().encode(canonicalize(first)).length,
    serialize: summarize(serializeTimes),
    deserialize: summarize(deserializeTimes),
    hashSource: lastHashSource,
  };
}

function rejects(payload: unknown): boolean {
  try {
    parseDocument(payload);
    return false;
  } catch {
    return true;
  }
}
