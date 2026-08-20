# aenima — build log

<!-- Keep this file in the Claude Project context and update it after every ticket.
     It exists so a fresh chat knows where the build stands without you re-explaining.
     Keep it short: state, decisions, open questions. Not a diary. -->

## Current state

**Phase:** 0 — foundation
**Next ticket:** T0.1 (scaffold and quality gates)
**Repo:** not yet created
**Deployed:** no

## Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | proposed |
| Styling | Tailwind v4 | proposed |
| Data + auth | Supabase (Postgres, Auth, Storage, RLS) | proposed |
| ORM | Drizzle | proposed |
| Jobs | Inngest, or Vercel cron + a jobs table | proposed |
| Tests | Vitest + Playwright | proposed |
| Hosting | Vercel | proposed |

Mark each **confirmed** before T0.1. Swapping after T1.1 is expensive.

## Tickets done

_(none yet — add a line per completed ticket: ID, one line of what shipped, commit hash)_

## Decisions made during the build

_(when a ticket's report-back raises a question and you answer it, record the answer here.
If the answer is a rule that should hold everywhere, also add it to CLAUDE.md in the repo.)_

## Open questions

1. Stack confirmation (above).
2. Seed content still owed: TR formality register per product, the ~80-term universal loanword
   list, confirmation of the appendix A baseline numbers, at-risk sort weights after four weeks
   of real use. None of these block phases 0–1.

## Accounts and keys needed

- [ ] Supabase project (URL, anon key, service role key)
- [ ] Anthropic and/or OpenAI API key — the workspace BYO key for the AI layer
- [ ] Notion internal integration (token + the pages/databases it can see)
- [ ] Figma personal access token
- [ ] Google Cloud OAuth client (Google sign-in, Drive watch)
- [ ] Apple sign-in credentials
- [ ] Vercel project
- [ ] Resend or Postmark (digest email) — not needed until phase 6
