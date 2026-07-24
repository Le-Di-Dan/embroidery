/**
 * Engine-neutral scene state shared by every adapter.
 *
 * This is the architectural point of the spike: the *document* is mutated by
 * domain code, and the renderer is a projection of it. No engine ever becomes
 * the source of truth (FRONTEND_CONVENTIONS §12), so `serialize()` cannot be
 * contaminated by engine-native state, and swapping engines does not change the
 * persisted bytes.
 */
import type {
  DesignElement,
  SpikeDesignDocument,
  TransformPatch,
  Viewport,
} from '../document/types';

export const INITIAL_VIEWPORT: Viewport = { zoom: 1, panXPx: 0, panYPx: 0 };

export class DocumentState {
  #document: SpikeDesignDocument;
  #selection = new Set<string>();
  #viewport: Viewport = INITIAL_VIEWPORT;
  #groupCounter = 0;

  constructor(document: SpikeDesignDocument) {
    this.#document = document;
  }

  get document(): SpikeDesignDocument {
    return this.#document;
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  replace(document: SpikeDesignDocument): void {
    this.#document = document;
    this.#selection.clear();
    this.#viewport = INITIAL_VIEWPORT;
  }

  setViewport(viewport: Viewport): void {
    this.#viewport = viewport;
  }

  byId(id: string): DesignElement | undefined {
    return this.#document.elements.find((element) => element.id === id);
  }

  selectable(): DesignElement[] {
    return this.#document.elements.filter((element) => !element.locked && element.visible);
  }

  select(ids: readonly string[]): void {
    this.#selection = new Set(ids.filter((id) => this.byId(id) !== undefined));
  }

  get selection(): readonly string[] {
    return [...this.#selection];
  }

  deleteSelected(): void {
    const removed = new Set(this.#selection);
    this.#mutate((elements) => elements.filter((element) => !removed.has(element.id)));
    this.#selection.clear();
  }

  transform(id: string, patch: TransformPatch): void {
    this.#mutate((elements) =>
      elements.map((element) => (element.id === id ? applyPatch(element, patch) : element)),
    );
  }

  setZIndex(id: string, index: number): void {
    this.#mutate((elements) => {
      const current = elements.findIndex((element) => element.id === id);
      if (current < 0) {
        return elements;
      }
      const next = [...elements];
      const [moved] = next.splice(current, 1);
      if (moved === undefined) {
        return elements;
      }
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      return next;
    });
  }

  setFlag(id: string, flag: 'locked' | 'visible', value: boolean): void {
    this.#mutate((elements) =>
      elements.map((element) => (element.id === id ? { ...element, [flag]: value } : element)),
    );
  }

  group(ids: readonly string[]): string {
    this.#groupCounter += 1;
    const groupId = `grp-${String(this.#groupCounter)}`;
    const members = ids.filter((id) => this.byId(id) !== undefined);
    const boxes = members
      .map((id) => this.byId(id))
      .filter((e): e is DesignElement => e !== undefined);
    const minX = Math.min(...boxes.map((e) => e.xPx));
    const minY = Math.min(...boxes.map((e) => e.yPx));
    const maxX = Math.max(...boxes.map((e) => e.xPx + e.widthPx));
    const maxY = Math.max(...boxes.map((e) => e.yPx + e.heightPx));
    const group: DesignElement = {
      id: groupId,
      type: 'group',
      xPx: minX,
      yPx: minY,
      widthPx: maxX - minX,
      heightPx: maxY - minY,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
      flipX: false,
      flipY: false,
      opacity: 1,
      visible: true,
      locked: false,
      groupId: null,
      childIds: members,
    };
    this.#mutate((elements) => [
      ...elements.map((element) =>
        members.includes(element.id) ? { ...element, groupId } : element,
      ),
      group,
    ]);
    return groupId;
  }

  ungroup(groupId: string): void {
    this.#mutate((elements) =>
      elements
        .filter((element) => element.id !== groupId)
        .map((element) => (element.groupId === groupId ? { ...element, groupId: null } : element)),
    );
  }

  #mutate(update: (elements: DesignElement[]) => DesignElement[]): void {
    this.#document = { ...this.#document, elements: update([...this.#document.elements]) };
  }
}

function applyPatch(element: DesignElement, patch: TransformPatch): DesignElement {
  const next = {
    ...element,
    xPx: element.xPx + (patch.dxPx ?? 0),
    yPx: element.yPx + (patch.dyPx ?? 0),
    widthPx: Math.max(1, element.widthPx + (patch.dWidthPx ?? 0)),
    heightPx: Math.max(1, element.heightPx + (patch.dHeightPx ?? 0)),
    rotationDeg: element.rotationDeg + (patch.dRotationDeg ?? 0),
    flipX: patch.flipX ?? element.flipX,
    flipY: patch.flipY ?? element.flipY,
    opacity: patch.opacity ?? element.opacity,
  };
  return next;
}
