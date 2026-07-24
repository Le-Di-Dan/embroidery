'use client';

import type Konva from 'konva';
import { createRoot, type Root } from 'react-dom/client';
import { Stage } from 'react-konva';

import { DocumentState } from '../document-state';
import { KonvaScene } from './scene';
import { WATERMARK_NODE_NAME, type WatermarkPolicy } from '../../harness/watermark';
import { loadAssets, type AssetRegistry } from '../../harness/assets';
import type { AdapterFactory, AdapterMetrics, MountOptions, RendererAdapter } from '../types';
import type { SpikeDesignDocument, TransformPatch, Viewport } from '../../document/types';

/**
 * Candidate A adapter — Konva `10.3.0` driven declaratively through
 * react-konva `19.2.5`. React owns the element tree; Konva owns the canvas
 * nodes; the document owns the truth.
 */
class KonvaAdapter implements RendererAdapter {
  readonly engine = 'konva' as const;

  #state: DocumentState | null = null;
  #root: Root | null = null;
  #stage: Konva.Stage | null = null;
  #watermark: WatermarkPolicy | null = null;
  #assets: AssetRegistry = new Map();

  async mount(options: MountOptions): Promise<void> {
    this.#assets = await loadAssets();
    this.#state = new DocumentState(options.document);
    this.#watermark = options.watermark;
    this.#root = createRoot(options.container);
    this.#render();
    await Promise.resolve();
  }

  async load(document: SpikeDesignDocument): Promise<void> {
    this.#requireState().replace(document);
    this.#render();
    await Promise.resolve();
  }

  select(ids: readonly string[]): void {
    this.#requireState().select(ids);
    this.#render();
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
    this.#requireState().deleteSelected();
    this.#render();
  }

  transform(id: string, patch: TransformPatch): void {
    this.#requireState().transform(id, patch);
    this.#render();
  }

  setZIndex(id: string, index: number): void {
    this.#requireState().setZIndex(id, index);
    this.#render();
  }

  setLocked(id: string, locked: boolean): void {
    this.#requireState().setFlag(id, 'locked', locked);
    this.#render();
  }

  setHidden(id: string, hidden: boolean): void {
    this.#requireState().setFlag(id, 'visible', !hidden);
    this.#render();
  }

  group(ids: readonly string[]): string {
    const groupId = this.#requireState().group(ids);
    this.#render();
    return groupId;
  }

  ungroup(groupId: string): void {
    this.#requireState().ungroup(groupId);
    this.#render();
  }

  setViewport(viewport: Viewport): void {
    this.#requireState().setViewport(viewport);
    this.#render();
  }

  getViewport(): Viewport {
    return this.#requireState().viewport;
  }

  hitTest(clientX: number, clientY: number): string | null {
    const stage = this.#stage;
    if (stage === null) {
      return null;
    }
    const box = stage.container().getBoundingClientRect();
    stage.setPointersPositions({ clientX, clientY });
    const shape = stage.getIntersection({ x: clientX - box.left, y: clientY - box.top });
    return shape?.id() ?? null;
  }

  serialize(): SpikeDesignDocument {
    return this.#requireState().document;
  }

  hasWatermarkOnTop(): boolean {
    const layers = this.#stage?.getLayers() ?? [];
    const last = layers[layers.length - 1];
    return last?.name() === WATERMARK_NODE_NAME && last.listening() === false;
  }

  metrics(): AdapterMetrics {
    const stage = this.#stage;
    const nodeCount = stage === null ? 0 : stage.find('Shape').length;
    const domNodeCount = stage === null ? 0 : stage.container().querySelectorAll('*').length;
    return { nodeCount, domNodeCount };
  }

  destroy(): void {
    this.#stage?.destroy();
    this.#stage = null;
    this.#root?.unmount();
    this.#root = null;
    this.#state = null;
  }

  #requireState(): DocumentState {
    if (this.#state === null) {
      throw new Error('Konva adapter is not mounted.');
    }
    return this.#state;
  }

  #render(): void {
    const state = this.#requireState();
    const watermark = this.#watermark;
    if (this.#root === null || watermark === null) {
      return;
    }
    const side = state.document.productSide;
    this.#root.render(
      <Stage
        width={side.widthPx}
        height={side.heightPx}
        ref={(stage: Konva.Stage | null) => {
          this.#stage = stage;
        }}
      >
        <KonvaScene
          document={state.document}
          selection={state.selection}
          viewport={state.viewport}
          watermark={watermark}
          assets={this.#assets}
        />
      </Stage>,
    );
  }
}

export const konvaFactory: AdapterFactory = {
  engine: 'konva',
  create: () => new KonvaAdapter(),
};
