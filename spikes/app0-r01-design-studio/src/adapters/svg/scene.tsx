'use client';

/**
 * Declarative React-rendered SVG scene (candidate C). Every element is a real
 * DOM node, which is the candidate's headline advantage (native hit-testing,
 * native focus/keyboard, assistive-technology reachability) and its headline
 * risk (DOM node count at scale).
 */
import { createElement, type ReactNode } from 'react';

import { WATERMARK_NODE_NAME, watermarkTiles, type WatermarkPolicy } from '../../harness/watermark';
import type { SvgFixture } from '../../harness/svg-fixture';
import type { DesignElement, SpikeDesignDocument, Viewport } from '../../document/types';

export interface SvgSceneProps {
  readonly document: SpikeDesignDocument;
  readonly selection: readonly string[];
  readonly viewport: Viewport;
  readonly watermark: WatermarkPolicy;
  readonly svgFixture: SvgFixture | null;
}

function transformOf(element: DesignElement): string {
  const cx = element.xPx + element.widthPx / 2;
  const cy = element.yPx + element.heightPx / 2;
  const flipX = element.flipX ? -1 : 1;
  const flipY = element.flipY ? -1 : 1;
  return `rotate(${String(element.rotationDeg)} ${String(cx)} ${String(cy)}) translate(${String(cx)} ${String(cy)}) scale(${String(element.scaleX * flipX)} ${String(element.scaleY * flipY)}) translate(${String(-cx)} ${String(-cy)})`;
}

function renderText(element: Extract<DesignElement, { type: 'text' }>): ReactNode {
  const lines = element.text.split('\n');
  const common = {
    fontFamily: element.fontFamily,
    fontSize: element.fontSizePx,
    letterSpacing: element.letterSpacingPx,
    fill: element.threadColorHex,
  };
  if (element.curve !== null) {
    const radius = element.curve.radiusPx;
    const sweep = element.curve.direction === 'up' ? 1 : 0;
    const pathId = `curve-${element.id}`;
    return (
      <>
        <defs>
          <path
            id={pathId}
            d={`M ${String(element.xPx)} ${String(element.yPx + radius)} A ${String(radius)} ${String(radius)} 0 0 ${String(sweep)} ${String(element.xPx + radius * 2)} ${String(element.yPx + radius)}`}
          />
        </defs>
        <text {...common}>
          <textPath href={`#${pathId}`}>{element.text.replace(/\n/g, ' ')}</textPath>
        </text>
      </>
    );
  }
  return (
    <text {...common} x={element.xPx} y={element.yPx + element.fontSizePx} textAnchor="start">
      {lines.map((line, index) => (
        <tspan
          key={`${element.id}-${String(index)}`}
          x={element.xPx}
          dy={index === 0 ? 0 : element.fontSizePx * element.lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function renderNode(
  element: DesignElement,
  children: readonly DesignElement[],
  fixture: SvgFixture | null,
): ReactNode {
  switch (element.type) {
    case 'text':
      return renderText(element);
    case 'image':
      return (
        <image
          href={element.asset.url}
          x={element.xPx}
          y={element.yPx}
          width={element.widthPx}
          height={element.heightPx}
          preserveAspectRatio="xMidYMid slice"
        />
      );
    case 'svg':
      return fixture === null ? null : (
        <svg
          x={element.xPx}
          y={element.yPx}
          width={element.widthPx}
          height={element.heightPx}
          viewBox={fixture.viewBox}
        >
          {fixture.nodes.map((node, index) =>
            createElement(node.tag, {
              key: `${element.id}-${String(index)}`,
              ...node.attributes,
              ...(element.recolorHex === null ? {} : { fill: element.recolorHex }),
            }),
          )}
        </svg>
      );
    case 'shape':
      return element.shape === 'rect' ? (
        <rect
          x={element.xPx}
          y={element.yPx}
          width={element.widthPx}
          height={element.heightPx}
          rx={element.cornerRadiusPx}
          fill={element.fillHex}
          stroke={element.strokeHex}
          strokeWidth={element.strokeWidthPx}
        />
      ) : (
        <ellipse
          cx={element.xPx + element.widthPx / 2}
          cy={element.yPx + element.heightPx / 2}
          rx={element.widthPx / 2}
          ry={element.heightPx / 2}
          fill={element.fillHex}
          stroke={element.strokeHex}
          strokeWidth={element.strokeWidthPx}
        />
      );
    case 'group':
      return <>{children.map((child) => renderElement(child, [], fixture))}</>;
    default:
      return null;
  }
}

function renderElement(
  element: DesignElement,
  children: readonly DesignElement[],
  fixture: SvgFixture | null,
): ReactNode {
  return (
    <g
      key={element.id}
      data-element-id={element.id}
      data-element-type={element.type}
      transform={transformOf(element)}
      opacity={element.opacity}
      visibility={element.visible ? 'visible' : 'hidden'}
      pointerEvents={element.locked ? 'none' : 'auto'}
    >
      {renderNode(element, children, fixture)}
    </g>
  );
}

export function SvgScene({ document, selection, viewport, watermark, svgFixture }: SvgSceneProps) {
  const side = document.productSide;
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
    <svg width={side.widthPx} height={side.heightPx} role="img" aria-label="Design preview">
      <image
        href={side.backgroundAsset.url}
        x={0}
        y={0}
        width={side.widthPx}
        height={side.heightPx}
      />
      <rect
        x={side.area.xPx}
        y={side.area.yPx}
        width={side.area.widthPx}
        height={side.area.heightPx}
        fill="none"
        stroke="#457b9d"
        strokeDasharray="6 4"
      />
      <g
        transform={`translate(${String(viewport.panXPx)} ${String(viewport.panYPx)}) scale(${String(viewport.zoom)})`}
      >
        {document.elements
          .filter((element) => element.groupId === null)
          .map((element) => renderElement(element, grouped.get(element.id) ?? [], svgFixture))}
        {document.elements
          .filter((element) => selected.has(element.id))
          .map((element) => (
            <rect
              key={`sel-${element.id}`}
              x={element.xPx}
              y={element.yPx}
              width={element.widthPx}
              height={element.heightPx}
              fill="none"
              stroke="#e63946"
              pointerEvents="none"
            />
          ))}
      </g>
      <g data-node-name={WATERMARK_NODE_NAME} pointerEvents="none" aria-hidden="true">
        {watermarkTiles(watermark, side.widthPx, side.heightPx).map((tile) => (
          <text
            key={`wm-${String(tile.xPx)}-${String(tile.yPx)}`}
            x={tile.xPx}
            y={tile.yPx}
            fontSize={watermark.fontSizePx}
            opacity={watermark.opacity}
            fill={watermark.darkHex}
            transform={`rotate(${String(watermark.angleDeg)} ${String(tile.xPx)} ${String(tile.yPx)})`}
          >
            {watermark.marker}
          </text>
        ))}
      </g>
    </svg>
  );
}
