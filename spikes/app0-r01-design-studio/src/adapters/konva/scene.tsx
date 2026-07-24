'use client';

/**
 * Declarative Konva scene (candidate A: Konva + react-konva). The component is
 * a pure projection of the engine-neutral document; it holds no state of its
 * own and never writes back into the document.
 */
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Text, TextPath } from 'react-konva';

import type { AssetRegistry } from '../../harness/assets';
import { WATERMARK_NODE_NAME, watermarkTiles, type WatermarkPolicy } from '../../harness/watermark';
import type { DesignElement, SpikeDesignDocument, Viewport } from '../../document/types';

export interface KonvaSceneProps {
  readonly document: SpikeDesignDocument;
  readonly selection: readonly string[];
  readonly viewport: Viewport;
  readonly watermark: WatermarkPolicy;
  readonly assets: AssetRegistry;
}

function commonProps(element: DesignElement): Record<string, unknown> {
  return {
    id: element.id,
    name: element.type,
    x: element.xPx,
    y: element.yPx,
    rotation: element.rotationDeg,
    scaleX: (element.flipX ? -1 : 1) * element.scaleX,
    scaleY: (element.flipY ? -1 : 1) * element.scaleY,
    opacity: element.opacity,
    visible: element.visible,
    listening: !element.locked,
  };
}

function renderElement(
  element: DesignElement,
  assets: AssetRegistry,
  children: readonly DesignElement[],
): React.ReactNode {
  const shared = commonProps(element);
  switch (element.type) {
    case 'text':
      if (element.curve !== null) {
        return (
          <TextPath
            key={element.id}
            {...shared}
            text={element.text.replace(/\n/g, ' ')}
            fontFamily={element.fontFamily}
            fontSize={element.fontSizePx}
            fill={element.threadColorHex}
            data={`M 0 ${String(element.curve.radiusPx)} A ${String(element.curve.radiusPx)} ${String(element.curve.radiusPx)} 0 0 ${element.curve.direction === 'up' ? '1' : '0'} ${String(element.curve.radiusPx * 2)} ${String(element.curve.radiusPx)}`}
          />
        );
      }
      return (
        <Text
          key={element.id}
          {...shared}
          text={element.text}
          width={element.widthPx}
          fontFamily={element.fontFamily}
          fontSize={element.fontSizePx}
          lineHeight={element.lineHeight}
          letterSpacing={element.letterSpacingPx}
          align={element.align}
          fill={element.threadColorHex}
        />
      );
    case 'image':
    case 'svg': {
      const image = assets.get(element.asset.url);
      if (image === undefined) {
        return null;
      }
      return (
        <KonvaImage
          key={element.id}
          {...shared}
          image={image}
          width={element.widthPx}
          height={element.heightPx}
        />
      );
    }
    case 'shape':
      return element.shape === 'rect' ? (
        <Rect
          key={element.id}
          {...shared}
          width={element.widthPx}
          height={element.heightPx}
          cornerRadius={element.cornerRadiusPx}
          fill={element.fillHex}
          stroke={element.strokeHex}
          strokeWidth={element.strokeWidthPx}
        />
      ) : (
        <Ellipse
          key={element.id}
          {...shared}
          radiusX={element.widthPx / 2}
          radiusY={element.heightPx / 2}
          fill={element.fillHex}
          stroke={element.strokeHex}
          strokeWidth={element.strokeWidthPx}
        />
      );
    case 'group':
      return (
        <Group key={element.id} {...shared} x={0} y={0} rotation={0}>
          {children.map((child) => renderElement(child, assets, []))}
        </Group>
      );
    default:
      return null;
  }
}

export function KonvaScene({ document, selection, viewport, watermark, assets }: KonvaSceneProps) {
  const side = document.productSide;
  const background = assets.get(side.backgroundAsset.url);
  const grouped = new Map<string, DesignElement[]>();
  for (const element of document.elements) {
    if (element.groupId !== null) {
      const bucket = grouped.get(element.groupId) ?? [];
      bucket.push(element);
      grouped.set(element.groupId, bucket);
    }
  }
  const selected = new Set(selection);

  return (
    <>
      <Layer listening={false}>
        {background === undefined ? null : (
          <KonvaImage image={background} width={side.widthPx} height={side.heightPx} />
        )}
        <Rect
          x={side.area.xPx}
          y={side.area.yPx}
          width={side.area.widthPx}
          height={side.area.heightPx}
          stroke="#457b9d"
          dash={[6, 4]}
        />
      </Layer>
      <Layer x={viewport.panXPx} y={viewport.panYPx} scaleX={viewport.zoom} scaleY={viewport.zoom}>
        {document.elements
          .filter((element) => element.groupId === null)
          .map((element) => renderElement(element, assets, grouped.get(element.id) ?? []))}
        {document.elements
          .filter((element) => selected.has(element.id))
          .map((element) => (
            <Rect
              key={`sel-${element.id}`}
              x={element.xPx}
              y={element.yPx}
              width={element.widthPx}
              height={element.heightPx}
              stroke="#e63946"
              strokeWidth={1}
              listening={false}
            />
          ))}
      </Layer>
      <Layer name={WATERMARK_NODE_NAME} listening={false}>
        {watermarkTiles(watermark, side.widthPx, side.heightPx).map((tile) => (
          <Text
            key={`wm-${String(tile.xPx)}-${String(tile.yPx)}`}
            x={tile.xPx}
            y={tile.yPx}
            text={watermark.marker}
            fontSize={watermark.fontSizePx}
            rotation={watermark.angleDeg}
            opacity={watermark.opacity}
            fill={watermark.darkHex}
            listening={false}
          />
        ))}
      </Layer>
    </>
  );
}
