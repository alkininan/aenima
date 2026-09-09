# Production 500 fix — the RSC boundary
_2026-08-23T21:02:42Z · `55b10f5`_

Production 500 fix — the RSC boundary: dictionary functions cannot cross from a Server Component
to a client one. Closed the hole that let it ship — `/dev/list` renders that boundary in a
Playwright run against a real `next build`, and the `/dev` gate is negative-checked. Sign-in's
focus modality starts unset — `55b10f5`.
