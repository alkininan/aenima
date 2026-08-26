/**
 * The seed's one real artifact — a Feature PRD for Sociera, written to be
 * scored.
 *
 * **This is also the first labeled sample of §12's golden set**, which is built
 * "by mutation — a clean, anonymized artifact that passes its rubric spawns
 * mutants with one planted defect each, so expected verdicts are known by
 * construction". This document is the other half of that: one artifact carrying
 * several planted defects at once, each in a known check, so a scoring run can
 * be graded the day the certification harness exists rather than admired.
 *
 * **The planted defects are listed in docs/build-log.md next to the T2.3
 * entry.** They are recorded there rather than here on purpose: a file the
 * scorer's input is drawn from must not contain the answer key, because the
 * body below is what a model reads, and a comment naming which checks fail
 * would be a comment telling it what to say.
 *
 * Three structural properties the document is built to have, which are the
 * reason it is worth seeding at all:
 *
 * - **No list surface**, so `prd-15` renormalizes *out* (−6).
 * - **Location and permission dependent**, so `prd-16` stays in.
 * - **User-to-user visibility**, so §4's safety layer turns on and `prd-20`
 *   renormalizes *in* (+5).
 *
 * A denominator of 99 rather than 100 or 105 is a run that exercised §4's
 * renormalization in both directions at once, and it is visible in one number.
 *
 * Written in English per §18 (English is the authoring source and §1 law 8's
 * pivot); the TR and NL variants the golden set wants are seed content still
 * owed, and are open question 1's list.
 */
export const GHOST_MODE_PRD = `# Ghost mode

## Problem

People check in at a venue to find the friends they came with, and then discover
that everyone else at the venue can see them too. In the last quarter, 213 members
checked in and then checked straight back out within 90 seconds, and 41 of them
wrote to support afterwards; the sentence that recurs is some version of "I did
not want the whole bar to know I was there." Today the only way to be at a venue
without being visible at it is to not check in, which also removes the reason to
open Sociera at all.

Opportunity: OPP-4, "presence is all-or-nothing".

## Audience

Members who have checked into two or more venues in the last 30 days and have at
least one blocked contact. That is 18% of monthly actives, and it is a filter we
can run against the user table today.

## Evidence

- 41 support conversations in Q1 tagged \`presence-privacy\`, read and coded.
- The 90-second check-in-then-out pattern, 213 occurrences, queried from the
  check-in table.
- Six user interviews in February; four described avoiding check-in at venues
  near their home or workplace.

Counter-evidence: three of the six said they would use a visibility control less
than once a month, and one said an invisible-presence feature would make her
trust the venue list less.

## Assumptions

- Members who want to be invisible want it for a stretch of time, not per person.
- The venue is the right unit of privacy — nobody has asked to be invisible to a
  single person at a venue while visible to the rest.
- Turning presence off does not reduce how often people check in.

## Hypothesis

We believe that giving members a per-venue invisibility toggle will reduce
check-in abandonment, measured by the share of check-ins reversed within 90
seconds.

Baseline: 3.4% of check-ins are reversed within 90 seconds (Q1, all venues).
Target: 2.0% within eight weeks of ship.

## Stories

**GM-1 — Turn ghost mode on at a venue.**
Given I am checked into a venue, when I open the venue screen and turn ghost mode
on, then my presence is hidden from every other member at that venue within five
seconds, and the venue screen shows that ghost mode is on.
On failure: WHEN the toggle cannot be saved THE SYSTEM SHALL leave the toggle in
its previous position and show "Couldn't change that — try again".

**GM-2 — Ghost mode ends when I leave.**
Given ghost mode is on, when the member leaves the venue, then ghost mode turns
off and the member's presence returns to normal for the next venue.
WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.
On failure: WHEN the venue exit cannot be confirmed THE SYSTEM SHALL leave ghost
mode on and retry on the next location update.

**GM-3 — See that I am invisible.**
Given ghost mode is on, when I look at the venue screen, then a persistent
indicator tells me that other members cannot see me here.

**GM-4 — Blocked contacts.**
Members someone has blocked never see them at a venue, ghost mode on or off.
This is existing behavior that the feature does not change, and it is the reason
ghost mode is a comfort control rather than the only protection anyone has.

**GM-5 — Ghost mode survives a restart.**
Given ghost mode is on and I force-quit the app, when I reopen it while still at
the venue, then ghost mode is still on.
On failure: WHEN the stored ghost-mode setting cannot be read at launch THE
SYSTEM SHALL default to ghost mode on and show "We kept you hidden".

## Degraded and denied behavior

WHEN location permission is denied THE SYSTEM SHALL hide the ghost-mode toggle
and show "Sociera needs location to know which venue you are at".
WHEN the device is offline THE SYSTEM SHALL show the last known ghost-mode
setting, disable the toggle, and show "You're offline — this will update when
you reconnect".
WHILE the presence service is degraded THE SYSTEM SHALL keep ghost mode on and
suppress presence updates rather than falling back to visible.

## Out of scope

- Per-person invisibility inside a venue. Ghost mode is all-or-nothing per venue.
- Invisibility outside a venue check-in — the friends map is untouched.
- Hiding past check-ins. Ghost mode is about the present only.
- Any change to how venues themselves see aggregate counts.

This feature adds one control and one indicator to the venue screen. It renders
no list of its own.

## Side effects

- The venue "who's here" count keeps counting ghosted members, so venue-side
  analytics do not move.
- Presence webhooks to partner venues stop firing for a ghosted member; the
  partner API's consumers need a release note.
- The weekly digest email must not mention a venue the member was ghosted at.
- Support tooling needs to show whether a member was ghosted when they report a
  missing friend, or every such report becomes a bug investigation.

## Ship scope

iOS and Android, EN and TR at launch and NL two weeks later, all members in
venues with presence enabled. Web is unaffected because web has no check-in.

## Data

Ghost mode stores one boolean and one venue id per member, held for the duration
of the check-in and deleted with it. Both are personal data, exported and deleted
with the account. No new location data is collected — the feature reads the
check-in that already exists.

## Instrumentation

Events: \`GhostOn\`, \`ghost_mode_toggled\`.

## Safety

The feature exists because presence can be used against a person: the members
who ask for it most are the ones avoiding an ex-partner or a colleague. Two ways
it could be turned against someone. First, a member could infer that another
member is present but ghosted, by comparing the venue's aggregate count against
the members shown as present — so that count is rounded to the nearest five
whenever the difference would be inferable. Second, someone could pressure a
member into proving they are not ghosted; turning ghost mode on or off produces
no notification to anyone, and there is no screen anywhere that shows another
member's ghost-mode setting, so there is nothing for a person to demand as
proof. Blocked contacts can never see a member regardless of ghost mode, which
is existing behavior this feature does not weaken.
`;
