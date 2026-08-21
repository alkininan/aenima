# aenima — build log

<!-- Keep this file in the Claude Project context and update it after every ticket.
     It exists so a fresh chat knows where the build stands without you re-explaining.
     Keep it short: state, decisions, open questions. Not a diary. -->

## Current state

**Phase:** 0 — foundation
**Next ticket:** T0.4
**Repo:** github.com/alkininan/aenima
**Deployed:** no

`docs/design-spec.md` is now **v2.2** — dot diameters, panel offset, overlay padding,
option-row precedence, the two toast clocks, and dismissal order closed as law.

## Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript strict | confirmed |
| Styling | Tailwind v4 | confirmed |
| Data + auth | Supabase (Postgres, Auth, Storage, RLS) | confirmed |
| ORM | Drizzle | confirmed |
| Jobs | decide at Phase 2, default Inngest | deferred |
| Tests | Vitest + Playwright | confirmed |
| Hosting | Vercel | confirmed |

Mark each **confirmed** before T0.1. Swapping after T1.1 is expensive.

## Tickets done

T0.1 — scaffold, strict TS, ESLint+Prettier, Vitest, Playwright, folder skeleton — `4e4d5ae`
T0.2 — design tokens, three faces, Æ mark, five primitives, /dev/primitives preview — `bdbaab6`
T0.3 — eleven composites, page.tsx replaced, layout metadata, scaffold assets removed — `e04da9f`

## Decisions made during the build

_(when a ticket's report-back raises a question and you answer it, record the answer here.
If the answer is a rule that should hold everywhere, also add it to CLAUDE.md in the repo.)_

- `build` and `start` stay in `package.json` and in CLAUDE.md's Commands block.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on deliberately.
- Prettier `printWidth` 100.
- Font faces declared in `@theme static`, not `:root` — Tailwind tree-shakes unused theme vars,
  so `static` is load-bearing.
- `next/font/google` accepted as self-hosted per design spec v2.1 §3; DM Sans preloaded alongside
  Space Grotesk.
- Select and menu option rows: 36h wins over §8's pad 8/12; horizontal padding 12, vertical
  centred within the 36.
- Toasts run 5s by default, 8s when carrying an undo action. §8 is the default, §12 the undo case.
- `Esc` is last-opened-wins. The z-ladder governs painting only — a popover inside a modal takes
  the first Escape even though §4 ranks it lower.
- System status dot and the radio's inner dot are both 8px; floating panels stand off their
  trigger by 8px.
- Overlay padding (modal, sheet, toast) is 20; any gap the spec does not name falls on the
  8-grid.
- jsdom + @testing-library/{react,dom,user-event} added as devDependencies — the focus-trap and
  keyboard tests §11 requires cannot run without a DOM.

## Open questions

1. Seed content still owed: TR formality register per product, the ~80-term universal loanword
   list, confirmation of the appendix A baseline numbers, at-risk sort weights after four weeks
   of real use. None of these block phases 0–1.

## Accounts and keys needed

- [x] Supabase project (URL, anon key, service role key)
- [ ] Anthropic and/or OpenAI API key — the workspace BYO key for the AI layer
- [ ] Notion internal integration (token + the pages/databases it can see)
- [ ] Figma personal access token
- [ ] Google Cloud OAuth client (Google sign-in, Drive watch)
- [ ] Apple sign-in credentials
- [ ] Vercel project — not yet
- [ ] Resend or Postmark (digest email) — not needed until phase 6

Supabase and Playwright MCP servers are connected.
