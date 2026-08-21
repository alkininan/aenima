/**
 * The §4 z-ladder as a runtime stack.
 *
 * design-spec.md §11: "`Esc` closes the topmost z-layer." Every dismissable
 * layer — tooltip, popover, modal, sheet — registers itself while it is open,
 * and only the layer on top of the stack acts on Escape. Without this a single
 * keypress would close a modal and the menu inside it at once.
 *
 * "Topmost" is the most recently opened layer, not the highest rung of §4's
 * ladder. Ruled on the T0.3 ticket: the z-ladder governs painting only. The two
 * disagree in the one case that matters — §4 puts a popover at 300 and a modal
 * at 400, but a select opened *inside* a modal paints above it and must take
 * the first Escape, and ranking by rung would close the modal and leave the
 * select hanging. `kind` is still recorded, so a layer always declares which
 * rung it renders on.
 */

/** §4 z-ladder. A layer never picks a number outside this map. */
export const Z_LAYERS = {
  content: 0,
  sticky: 100,
  chat: 200,
  popover: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const;

export type LayerKind = keyof typeof Z_LAYERS;

type Entry = { id: string; kind: LayerKind; seq: number };

let stack: Entry[] = [];
let sequence = 0;

/** Registers an open layer. Returns the id so the caller can release it. */
export function pushLayer(id: string, kind: LayerKind): string {
  removeLayer(id);
  sequence += 1;
  stack.push({ id, kind, seq: sequence });
  return id;
}

export function removeLayer(id: string): void {
  stack = stack.filter((entry) => entry.id !== id);
}

/** The layer Escape belongs to: the one opened most recently. */
export function topLayer(): string | undefined {
  let top: Entry | undefined;
  for (const entry of stack) {
    if (!top || entry.seq > top.seq) top = entry;
  }
  return top?.id;
}

/** Which rung of §4's ladder a registered layer paints on. */
export function layerKind(id: string): LayerKind | undefined {
  return stack.find((entry) => entry.id === id)?.kind;
}

export function isTopLayer(id: string): boolean {
  return topLayer() === id;
}

export function layerCount(): number {
  return stack.length;
}

/** Test-only: the stack is module state, so each test starts from empty. */
export function resetLayers(): void {
  stack = [];
  sequence = 0;
}
