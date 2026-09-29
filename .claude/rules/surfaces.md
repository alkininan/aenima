---
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/i18n/**"
---

# Surfaces

Rules about what renders. `CLAUDE.md` already says Server Components by default, tokens over hardcoded values, and no bare strings in JSX; those are not repeated.

- A preview renders on the same side of the RSC boundary as the surface it previews, which is why `/dev/list` exists beside the client-rooted `/dev/primitives`. — "A preview must render on the same side of the RSC boundary as the surface it previews."
- A client component reads its own dictionary copy and is never handed one, because a formatter function cannot cross the boundary. — "Client components read their own copy; they are never handed the dictionary."
- `/dev` is gated on the build mode, and `e2e/production.spec.ts` against a real build is what proves the gate is wired — the gate is inert under `next dev`. — "is gated on the build mode"
- Focus modality is tracked on `<html>` and rendered before first paint, not gated on `:focus-visible`, which Chromium matches on a clicked text input. — "is not the focus split."
- `src/components/ui/icons.tsx` is the only module that imports `iconoir-react`; call sites take named exports from it. — "is the only module that imports `iconoir-react`"
- The morph's trigger hides for the panel's lifetime with `opacity: 0` and `pointer-events: none`, never `visibility: hidden`: in Chromium an anchor hidden by `visibility` stops its anchor-positioned panel taking pointer events, and §6 forbids setting `position-visibility`. — `docs/log/T0.37.md`
- An element shown as a popover undoes the parts of the UA's `[popover]:popover-open` rule it does not want — `inset: 0`, `fit-content` on both axes, a `Canvas` fill, `overflow: auto` — or a region meant for the bottom sits at the top-left on a solid strip. — `docs/log/T0.37.md`
- A `view-transition-name` goes on an element that generates a box: one on `display: contents` is skipped by capture, and its pseudo-elements and their animations never exist. — `docs/log/T0.37.md`
- A dictionary key that holds one of design-spec §12's microcopy defaults gets its row in `DEFAULTS` (`scripts/design/laws.mjs`) in the same change, and the key holds §12's words verbatim — C-33 reads the table, not the tree, so a key added without its row is never checked. — `docs/log/T0.38.md`
- An element scaled by `transform` has a box that hugs its content, never `left: 0; right: 0`: the scale grows the whole box, and the full-width floating label scaled 17/13 gave a 375 page a scrollWidth of 490. — `docs/log/T0.42.md`
- Copy that places an element inside a sentence goes into a Button as one inline span, because the Button's `inline-flex` row turns each part into a flex item, gaps the parts apart and spaces the accessible name. — `docs/log/T0.42.md`
- Chrome that must answer while a read is held takes the read as a promise and fills by effect, never as a Suspense slot: React leaves a pending boundary's fallback un-hydrated, so a switcher rendered as one is inert for exactly as long as the read is held. — `docs/log/T0.48.md`
- A redirect thrown after the shell has streamed is a meta refresh in the body and not a 307, so the session await that turns an anonymous visitor away stays in the layout, before the shell. — `docs/log/T0.48.md`
- Geometry that must beat a utility a surface carries at every width, like the bottom sheet's corners and footer, is unlayered CSS: a `@layer components` rule cannot outrank a utility. — `docs/log/T0.48.md`
- A class-string constant a Server Component reads lives in a plain module like `variants.ts`, never in a `"use client"` component beside it: a client module's exports reach a Server Component as client references, not values. — `docs/log/T0.49.md`
- A link meant to land inside a closed `<details>` carries its target in the query as well as the fragment: a full navigation reveals the ancestor on the fragment, and the app router's client navigation scrolls by `scrollIntoView()` on an element that is not rendered and reveals nothing. — `docs/log/T0.49.md`
- A roving Tab stop across Server Component rows is seeded by the server on one row and moved by the walker writing `tabindex` on the DOM, since the rows never re-render for it. — `docs/log/T0.49.md`
- Dimming that keeps its text tone paints the .60 on a layer under the text — an `aria-hidden` span inside the element's own stacking context — never `opacity` on the element, which dims the text with it. — `docs/log/T0.49.md`
- A row that takes two heights is one grid of named areas under a container query with the DOM order fixed, so the keyboard order is one order at both heights. — `docs/log/T0.49.md`
