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
