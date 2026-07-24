'use client';

import { createRoot, type Root } from 'react-dom/client';

import { DocumentState } from '../document-state';
import { SvgScene } from './scene';
import { WATERMARK_NODE_NAME, type WatermarkPolicy } from '../../harness/watermark';
import { loadSvgFixture, type SvgFixture } from '../../harness/svg-fixture';
import type { AdapterFactory, AdapterMetrics, MountOptions, RendererAdapter } from '../types';
import type { SpikeDesignDocument, TransformPatch, Viewport } from '../../document/types';

/**
 * Candidate C adapter — native SVG rendered by React 19 itself. No rendering
 * library and no interaction library: `interactjs 1.10.27` was audited and
 * rejected as the pointer layer because its last release is 2024-03-28, so the
 * candidate uses the platform Pointer Events API instead (see the ADR).
 */
class SvgAdapter implements RendererAdapter {
  readonly engine = 'svg' as const;

  #state: DocumentState | null = null;
  #root: Root | null = null;
  #container: HTMLElement | null = null;
  #watermark: WatermarkPolicy | null = null;
  #fixture: SvgFixture | null = null;

  async mount(options: MountOptions): Promise<void> {
    this.#fixture = await loadSvgFixture('/assets/mark.svg');
    this.#state = new DocumentState(options.document);
    this.#watermark = options.watermark;
    this.#container = options.container;
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
    // Native DOM hit testing: no engine involved, and it honours pointer-events
    // (locked elements are `pointer-events: none`) for free.
    const target = window.document.elementFromPoint(clientX, clientY);
    return target?.closest('[data-element-id]')?.getAttribute('data-element-id') ?? null;
  }

  serialize(): SpikeDesignDocument {
    return this.#requireState().document;
  }

  hasWatermarkOnTop(): boolean {
    const svg = this.#container?.querySelector('svg');
    const last = svg?.lastElementChild;
    return (
      last?.getAttribute('data-node-name') === WATERMARK_NODE_NAME &&
      last.getAttribute('pointer-events') === 'none'
    );
  }

  metrics(): AdapterMetrics {
    const domNodeCount = this.#container?.querySelectorAll('*').length ?? 0;
    return {
      nodeCount: this.#container?.querySelectorAll('[data-element-id]').length ?? 0,
      domNodeCount,
    };
  }

  destroy(): void {
    this.#root?.unmount();
    this.#root = null;
    this.#container = null;
    this.#state = null;
  }

  #requireState(): DocumentState {
    if (this.#state === null) {
      throw new Error('SVG adapter is not mounted.');
    }
    return this.#state;
  }

  #render(): void {
    const state = this.#requireState();
    const watermark = this.#watermark;
    if (this.#root === null || watermark === null) {
      return;
    }
    this.#root.render(
      <SvgScene
        document={state.document}
        selection={state.selection}
        viewport={state.viewport}
        watermark={watermark}
        svgFixture={this.#fixture}
      />,
    );
  }
}

export const svgFactory: AdapterFactory = {
  engine: 'svg',
  create: () => new SvgAdapter(),
};
