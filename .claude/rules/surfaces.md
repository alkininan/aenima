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
