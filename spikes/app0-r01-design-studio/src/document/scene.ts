/**
 * Deterministic scene fixtures. Every candidate renders exactly the same
 * documents, so nothing in the benchmark is engine-tuned.
 */
import {
  SPIKE_SCHEMA_VERSION,
  type AssetRef,
  type DesignElement,
  type ProductSide,
  type SpikeDesignDocument,
} from './types';

export type SceneSize = 'S' | 'M' | 'L';

export const SCENE_ELEMENT_COUNTS: Record<SceneSize, number> = { S: 10, M: 50, L: 150 };

/** Frozen mix (checkpoint §19). Group/locked/hidden are applied on top. */
export const SCENE_MIX = { text: 0.4, image: 0.3, shape: 0.2, svg: 0.1 } as const;

const FONT_WHITELIST = ['Arial', 'Georgia', 'Verdana'] as const;
const THREAD_COLORS = [
  { code: 'TC-1801', hex: '#1d3557' },
  { code: 'TC-2204', hex: '#e63946' },
  { code: 'TC-3310', hex: '#f1faee' },
] as const;

function asset(id: string, url: string): AssetRef {
  return { assetId: id, derivative: 'editor-preview', url };
}

export const PRODUCT_SIDE: ProductSide = {
  sideId: 'front',
  label: 'Front',
  backgroundAsset: asset('asset-product-front', '/assets/product-front.png'),
  widthPx: 900,
  heightPx: 900,
  area: {
    id: 'area-chest-left',
    xPx: 260,
    yPx: 220,
    widthPx: 380,
    heightPx: 300,
    widthMm: 190,
    heightMm: 150,
  },
};

/** Deterministic PRNG so every run and every engine sees identical geometry. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Base {
  id: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  visible: boolean;
  locked: boolean;
  groupId: string | null;
}

function base(id: string, random: () => number): Base {
  const area = PRODUCT_SIDE.area;
  return {
    id,
    xPx: Math.round(area.xPx + random() * (area.widthPx - 120)),
    yPx: Math.round(area.yPx + random() * (area.heightPx - 80)),
    widthPx: 60 + Math.round(random() * 80),
    heightPx: 30 + Math.round(random() * 50),
    rotationDeg: Math.round(random() * 30) - 15,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    opacity: 1,
    visible: true,
    locked: false,
    groupId: null,
  };
}

function textElement(id: string, random: () => number, multiline: boolean): DesignElement {
  const font = FONT_WHITELIST[Math.floor(random() * FONT_WHITELIST.length)] ?? 'Arial';
  const thread = THREAD_COLORS[Math.floor(random() * THREAD_COLORS.length)] ?? THREAD_COLORS[0];
  return {
    ...base(id, random),
    type: 'text',
    text: multiline ? 'Embroidery\nStudio spike' : 'Stitch',
    fontFamily: font,
    fontSizePx: 18 + Math.round(random() * 10),
    align: 'center',
    lineHeight: 1.2,
    letterSpacingPx: 0,
    threadColorCode: thread.code,
    threadColorHex: thread.hex,
    curve: null,
  };
}

function imageElement(id: string, random: () => number, index: number): DesignElement {
  const file = index % 2 === 0 ? '/assets/badge.png' : '/assets/photo.jpg';
  return {
    ...base(id, random),
    type: 'image',
    asset: asset(`asset-raster-${index % 2}`, file),
    cropPct: { x: 0, y: 0, w: 1, h: 1 },
  };
}

function svgElement(id: string, random: () => number): DesignElement {
  return {
    ...base(id, random),
    type: 'svg',
    asset: asset('asset-mark', '/assets/mark.svg'),
    recolorHex: null,
  };
}

function shapeElement(id: string, random: () => number, index: number): DesignElement {
  return {
    ...base(id, random),
    type: 'shape',
    shape: index % 2 === 0 ? 'rect' : 'ellipse',
    fillHex: '#a8dadc',
    strokeHex: '#1d3557',
    strokeWidthPx: 2,
    cornerRadiusPx: 4,
  };
}

/**
 * The checkpoint §13 "common scene": one of everything, including the mixed
 * group, the locked item, the hidden item and the curved-text probe. The
 * repeated watermark is deliberately absent — it is preview policy, not
 * document content.
 */
export function commonScene(): SpikeDesignDocument {
  const random = mulberry32(20260724);
  const textA = textElement('el-text-a', random, true);
  const textB = textElement('el-text-b', random, true);
  const curved = {
    ...textElement('el-text-curved', random, false),
    curve: { radiusPx: 160, direction: 'up' },
  } as DesignElement;
  const imageA = imageElement('el-image-a', random, 0);
  const imageB = imageElement('el-image-b', random, 1);
  const svg = svgElement('el-svg-a', random);
  const shapeA = shapeElement('el-shape-a', random, 0);
  const shapeB = shapeElement('el-shape-b', random, 1);
  const locked = { ...shapeElement('el-locked', random, 0), locked: true } as DesignElement;
  const hidden = { ...textElement('el-hidden', random, false), visible: false } as DesignElement;
  const groupedText = {
    ...textElement('el-group-text', random, false),
    groupId: 'el-group',
  } as DesignElement;
  const groupedShape = {
    ...shapeElement('el-group-shape', random, 1),
    groupId: 'el-group',
  } as DesignElement;
  const groupedImage = {
    ...imageElement('el-group-image', random, 0),
    groupId: 'el-group',
  } as DesignElement;
  const group: DesignElement = {
    ...base('el-group', random),
    type: 'group',
    childIds: ['el-group-text', 'el-group-shape', 'el-group-image'],
  };

  return {
    schemaVersion: SPIKE_SCHEMA_VERSION,
    documentId: 'doc-common-scene',
    productSide: PRODUCT_SIDE,
    elements: [
      shapeA,
      shapeB,
      imageA,
      imageB,
      svg,
      textA,
      textB,
      curved,
      locked,
      hidden,
      group,
      groupedText,
      groupedShape,
      groupedImage,
    ],
  };
}

/** S/M/L performance scenes built from the frozen mix. */
export function performanceScene(size: SceneSize): SpikeDesignDocument {
  const total = SCENE_ELEMENT_COUNTS[size];
  const random = mulberry32(1301 + total);
  const elements: DesignElement[] = [];
  const counts = {
    text: Math.round(total * SCENE_MIX.text),
    image: Math.round(total * SCENE_MIX.image),
    shape: Math.round(total * SCENE_MIX.shape),
  };
  counts.text = Math.max(1, counts.text);
  const svgCount = total - counts.text - counts.image - counts.shape;

  for (let i = 0; i < counts.text; i += 1) {
    elements.push(textElement(`s-text-${i}`, random, i % 3 === 0));
  }
  for (let i = 0; i < counts.image; i += 1) {
    elements.push(imageElement(`s-image-${i}`, random, i));
  }
  for (let i = 0; i < counts.shape; i += 1) {
    elements.push(shapeElement(`s-shape-${i}`, random, i));
  }
  for (let i = 0; i < svgCount; i += 1) {
    elements.push(svgElement(`s-svg-${i}`, random));
  }

  // Groups/locked/hidden on top of the mix, as the frozen scenario requires.
  const withFlags = elements.map((element, index) => {
    if (index === 1) {
      return { ...element, locked: true };
    }
    if (index === 2) {
      return { ...element, visible: false };
    }
    if (index < 6 && index >= 3) {
      return { ...element, groupId: 's-group' };
    }
    return element;
  });
  const group: DesignElement = {
    ...base('s-group', random),
    type: 'group',
    childIds: withFlags
      .filter((element) => element.groupId === 's-group')
      .map((element) => element.id),
  };

  return {
    schemaVersion: SPIKE_SCHEMA_VERSION,
    documentId: `doc-perf-${size}`,
    productSide: PRODUCT_SIDE,
    elements: [...withFlags, group],
  };
}

/**
 * The cross-engine common subset: the element kinds and properties that all
 * finalists must load identically (checkpoint §11 rule 12).
 */
export function crossEngineSubset(): SpikeDesignDocument {
  const scene = commonScene();
  return {
    ...scene,
    documentId: 'doc-cross-engine-subset',
    elements: scene.elements.filter(
      (element) =>
        element.type !== 'group' && element.groupId === null && element.id !== 'el-text-curved',
    ),
  };
}
