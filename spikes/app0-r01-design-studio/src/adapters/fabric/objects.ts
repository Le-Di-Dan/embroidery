'use client';

/**
 * Element → Fabric object mapping (candidate B: Fabric.js 7.4.0, imperative).
 * Fabric owns retained objects, so the adapter keeps an id → object map and
 * pushes incremental property updates instead of rebuilding the scene.
 */
import {
  Ellipse,
  FabricImage,
  type FabricObject,
  FabricText,
  Group,
  Path,
  Rect,
  loadSVGFromURL,
  util,
} from 'fabric';

import type { AssetRegistry } from '../../harness/assets';
import type { DesignElement } from '../../document/types';

/** Properties every element shares, in Fabric's vocabulary. */
export function sharedProps(element: DesignElement): Record<string, unknown> {
  return {
    left: element.xPx,
    top: element.yPx,
    angle: element.rotationDeg,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    flipX: element.flipX,
    flipY: element.flipY,
    opacity: element.opacity,
    visible: element.visible,
    selectable: !element.locked,
    evented: !element.locked,
    objectCaching: true,
  };
}

function curvePath(radiusPx: number, up: boolean): Path {
  const sweep = up ? 1 : 0;
  return new Path(
    `M 0 ${String(radiusPx)} A ${String(radiusPx)} ${String(radiusPx)} 0 0 ${String(sweep)} ${String(radiusPx * 2)} ${String(radiusPx)}`,
    { visible: false },
  );
}

async function createSvgObject(url: string, element: DesignElement): Promise<FabricObject> {
  const result = await loadSVGFromURL(url);
  const objects = result.objects.filter((object): object is FabricObject => object !== null);
  const grouped = util.groupSVGElements(objects, result.options);
  grouped.set({ ...sharedProps(element) });
  grouped.scaleToWidth(element.widthPx);
  return grouped;
}

export async function createObject(
  element: DesignElement,
  assets: AssetRegistry,
): Promise<FabricObject | null> {
  const shared = sharedProps(element);
  switch (element.type) {
    case 'text': {
      const text = new FabricText(element.text, {
        ...shared,
        fontFamily: element.fontFamily,
        fontSize: element.fontSizePx,
        lineHeight: element.lineHeight,
        charSpacing: element.letterSpacingPx * 10,
        textAlign: element.align,
        fill: element.threadColorHex,
      });
      if (element.curve !== null) {
        // Fabric supports text-on-path natively; the curved-text probe uses it.
        text.set({ path: curvePath(element.curve.radiusPx, element.curve.direction === 'up') });
      }
      return text;
    }
    case 'image': {
      const image = assets.get(element.asset.url);
      if (image === undefined) {
        return null;
      }
      const object = new FabricImage(image, shared);
      object.scaleToWidth(element.widthPx);
      return object;
    }
    case 'svg':
      return createSvgObject(element.asset.url, element);
    case 'shape':
      return element.shape === 'rect'
        ? new Rect({
            ...shared,
            width: element.widthPx,
            height: element.heightPx,
            rx: element.cornerRadiusPx,
            ry: element.cornerRadiusPx,
            fill: element.fillHex,
            stroke: element.strokeHex,
            strokeWidth: element.strokeWidthPx,
          })
        : new Ellipse({
            ...shared,
            rx: element.widthPx / 2,
            ry: element.heightPx / 2,
            fill: element.fillHex,
            stroke: element.strokeHex,
            strokeWidth: element.strokeWidthPx,
          });
    case 'group':
      return new Group([], { ...shared, width: element.widthPx, height: element.heightPx });
    default:
      return null;
  }
}

/** Recolour probe: only real vector objects can be recoloured, not raster. */
export function recolor(object: FabricObject, hex: string): boolean {
  if (object instanceof Group) {
    for (const child of object.getObjects()) {
      child.set({ fill: hex });
    }
    return true;
  }
  if (object instanceof FabricImage) {
    return false;
  }
  object.set({ fill: hex });
  return true;
}
