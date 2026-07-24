'use client';

import { Canvas, type FabricObject, FabricText, Rect } from 'fabric';

import { DocumentState } from '../document-state';
import { createObject, sharedProps } from './objects';
import { watermarkTiles, type WatermarkPolicy } from '../../harness/watermark';
import { loadAssets, type AssetRegistry } from '../../harness/assets';
import type { AdapterFactory, AdapterMetrics, MountOptions, RendererAdapter } from '../types';
import type { SpikeDesignDocument, TransformPatch, Viewport } from '../../document/types';

/** Candidate B adapter — Fabric.js 7.4.0, imperative, no React binding exists. */
class FabricAdapter implements RendererAdapter {
  readonly engine = 'fabric' as const;

  #state: DocumentState | null = null;
  #canvas: Canvas | null = null;
  #objects = new Map<string, FabricObject>();
  #watermarkObjects: FabricObject[] = [];
  #watermark: WatermarkPolicy | null = null;
  #assets: AssetRegistry = new Map();

  async mount(options: MountOptions): Promise<void> {
    this.#assets = await loadAssets();
    this.#state = new DocumentState(options.document);
    this.#watermark = options.watermark;
    const side = options.document.productSide;
    const element = window.document.createElement('canvas');
    element.width = side.widthPx;
    element.height = side.heightPx;
    options.container.appendChild(element);
    this.#canvas = new Canvas(element, {
      width: side.widthPx,
      height: side.heightPx,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: '#f8f9fa',
    });
    await this.#rebuild();
  }

  async load(document: SpikeDesignDocument): Promise<void> {
    this.#requireState().replace(document);
    await this.#rebuild();
  }

  select(ids: readonly string[]): void {
    const state = this.#requireState();
    state.select(ids);
    const canvas = this.#requireCanvas();
    canvas.discardActiveObject();
    const objects = state.selection
      .map((id) => this.#objects.get(id))
      .filter((object): object is FabricObject => object !== undefined);
    if (objects.length === 1 && objects[0] !== undefined) {
      canvas.setActiveObject(objects[0]);
    }
    canvas.requestRenderAll();
  }

  getSelection(): readonly string[] {
    return this.#requireState().selection;
  }

  selectAll(): readonly string[] {
    const ids = this.#requireState()
      .selectable()
      .map((element) => element.id);
    this.select(ids);
    return this.getSelection();
  }

  deleteSelected(): void {
    const state = this.#requireState();
    for (const id of state.selection) {
      const object = this.#objects.get(id);
      if (object !== undefined) {
        this.#requireCanvas().remove(object);
        this.#objects.delete(id);
      }
    }
    state.deleteSelected();
    this.#bringWatermarkToFront();
  }

  transform(id: string, patch: TransformPatch): void {
    const state = this.#requireState();
    state.transform(id, patch);
    const element = state.byId(id);
    const object = this.#objects.get(id);
    if (element === undefined || object === undefined) {
      return;
    }
    object.set(sharedProps(element));
    object.setCoords();
    this.#requireCanvas().requestRenderAll();
  }

  setZIndex(id: string, index: number): void {
    this.#requireState().setZIndex(id, index);
    const object = this.#objects.get(id);
    if (object !== undefined) {
      this.#requireCanvas().moveObjectTo(object, index);
    }
    this.#bringWatermarkToFront();
  }

  setLocked(id: string, locked: boolean): void {
    this.#requireState().setFlag(id, 'locked', locked);
    this.#objects.get(id)?.set({ selectable: !locked, evented: !locked });
    this.#requireCanvas().requestRenderAll();
  }

  setHidden(id: string, hidden: boolean): void {
    this.#requireState().setFlag(id, 'visible', !hidden);
    this.#objects.get(id)?.set({ visible: !hidden });
    this.#requireCanvas().requestRenderAll();
  }

  group(ids: readonly string[]): string {
    const groupId = this.#requireState().group(ids);
    void this.#rebuild();
    return groupId;
  }

  ungroup(groupId: string): void {
    this.#requireState().ungroup(groupId);
    void this.#rebuild();
  }

  setViewport(viewport: Viewport): void {
    this.#requireState().setViewport(viewport);
    this.#requireCanvas().setViewportTransform([
      viewport.zoom,
      0,
      0,
      viewport.zoom,
      viewport.panXPx,
      viewport.panYPx,
    ]);
  }

  getViewport(): Viewport {
    return this.#requireState().viewport;
  }

  hitTest(clientX: number, clientY: number): string | null {
    const canvas = this.#requireCanvas();
    const point = canvas.getScenePoint({ clientX, clientY } as unknown as MouseEvent);
    for (const [id, object] of [...this.#objects].reverse()) {
      if (object.visible && object.selectable && object.containsPoint(point)) {
        return id;
      }
    }
    return null;
  }

  serialize(): SpikeDesignDocument {
    return this.#requireState().document;
  }

  hasWatermarkOnTop(): boolean {
    const objects = this.#requireCanvas().getObjects();
    const tail = objects.slice(objects.length - this.#watermarkObjects.length);
    return (
      this.#watermarkObjects.length > 0 &&
      tail.every((object) => this.#watermarkObjects.includes(object) && object.selectable === false)
    );
  }

  metrics(): AdapterMetrics {
    return {
      nodeCount: this.#requireCanvas().getObjects().length,
      domNodeCount:
        this.#requireCanvas().getElement().parentElement?.querySelectorAll('*').length ?? 0,
    };
  }

  destroy(): void {
    void this.#canvas?.dispose();
    this.#canvas = null;
    this.#objects.clear();
    this.#watermarkObjects = [];
    this.#state = null;
  }

  #requireState(): DocumentState {
    if (this.#state === null) {
      throw new Error('Fabric adapter is not mounted.');
    }
    return this.#state;
  }

  #requireCanvas(): Canvas {
    if (this.#canvas === null) {
      throw new Error('Fabric adapter is not mounted.');
    }
    return this.#canvas;
  }

  async #rebuild(): Promise<void> {
    const canvas = this.#requireCanvas();
    const state = this.#requireState();
    canvas.remove(...canvas.getObjects());
    this.#objects.clear();
    this.#watermarkObjects = [];

    const side = state.document.productSide;
    const background = this.#assets.get(side.backgroundAsset.url);
    if (background !== undefined) {
      const { FabricImage } = await import('fabric');
      const image = new FabricImage(background, { selectable: false, evented: false });
      image.scaleToWidth(side.widthPx);
      canvas.add(image);
    }
    canvas.add(
      new Rect({
        left: side.area.xPx,
        top: side.area.yPx,
        width: side.area.widthPx,
        height: side.area.heightPx,
        fill: 'transparent',
        stroke: '#457b9d',
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      }),
    );

    for (const element of state.document.elements) {
      const object = await createObject(element, this.#assets);
      if (object !== null) {
        // Fabric caches transform corners; without setCoords() after any
        // creation-time scaling, containsPoint()/hit testing uses stale
        // geometry and the object becomes untappable.
        object.setCoords();
        this.#objects.set(element.id, object);
        canvas.add(object);
      }
    }
    this.#addWatermark();
    canvas.requestRenderAll();
  }

  #addWatermark(): void {
    const policy = this.#watermark;
    const canvas = this.#requireCanvas();
    if (policy === null) {
      return;
    }
    const side = this.#requireState().document.productSide;
    this.#watermarkObjects = watermarkTiles(policy, side.widthPx, side.heightPx).map((tile) => {
      const text = new FabricText(policy.marker, {
        left: tile.xPx,
        top: tile.yPx,
        angle: policy.angleDeg,
        fontSize: policy.fontSizePx,
        opacity: policy.opacity,
        fill: policy.darkHex,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      canvas.add(text);
      return text;
    });
  }

  #bringWatermarkToFront(): void {
    const canvas = this.#requireCanvas();
    for (const object of this.#watermarkObjects) {
      canvas.bringObjectToFront(object);
    }
    canvas.requestRenderAll();
  }
}

export const fabricFactory: AdapterFactory = {
  engine: 'fabric',
  create: () => new FabricAdapter(),
};
