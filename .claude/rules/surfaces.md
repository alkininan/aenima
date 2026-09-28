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
- A rule that has to undo a utility's size or position stands outside `@layer components`: a layered rule loses to an unlayered utility whatever its specificity, which is why the skip link's clipped box and the kbd's touch rule stand beside the reduced-motion block outside every layer. — `docs/log/T0.45.md`
- A navigation out of a list that is not a click on `[data-row-link]` records the way back itself — `rememberReturn` under `routeKey(pathname, search)` before the push — or Back lands on the main region instead of the opened row. — `docs/log/T0.45.md`
- Recorded keyboard input is a latch on `<html>` (`data-keyboard-recorded`), written at the first focus key and never removed, never the modality of the moment, which flips back to pointer at the next tap on a device that taps and types by turns. — `docs/log/T0.45.md`
