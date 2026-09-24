/**
 * design-spec.md §8.20 and §8.14 — where a floating layer lives while a modal is open.
 *
 * §8.20, of the toast: "its host is the `popover="manual"` of §4's ladder, moved into the
 * open modal's subtree so it stays operable." §8.14 says the same of a tooltip: "Inside an
 * open modal it is hosted in the modal's subtree (§4), so the pointer can cross onto it
 * without the page's inertness hiding it."
 *
 * The reason is the same for both and it is not about paint. A modal makes the rest of the
 * page inert; a toast rendered at the document's root while a modal is open is painted
 * above it and cannot be clicked, which is exactly the failure C-20 names ("a toast raised
 * over an open modal is clickable"). Moving the host inside the modal puts it on the live
 * side of the inertness.
 *
 * A stack rather than a single slot, because a modal can open over a modal and what the
 * toast wants is the innermost live subtree. The registry is DOM-shaped and framework-free
 * so the two consumers can portal into it and the modal need know nothing about either.
 */

type Listener = () => void;

let hosts: HTMLElement[] = [];
const listeners = new Set<Listener>();

function announce(): void {
  for (const listener of [...listeners]) listener();
}

/** The innermost open modal's subtree, or null when no modal is open. */
export function getOverlayHost(): HTMLElement | null {
  return hosts[hosts.length - 1] ?? null;
}

/** Registers a modal's subtree as the host. Returns the release. */
export function pushOverlayHost(element: HTMLElement): () => void {
  hosts.push(element);
  announce();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hosts = hosts.filter((host) => host !== element);
    announce();
  };
}

export function subscribeOverlayHost(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: the stack is module state, so each test starts from empty. */
export function resetOverlayHosts(): void {
  hosts = [];
  listeners.clear();
}
