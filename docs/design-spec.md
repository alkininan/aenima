# aenima — Design Specification v2.6 (web)

<!-- Full rewrite for direct vibe-coding: every value explicit, no Figma step assumed. Supersedes v1.x.
v2.0: aesthetic consolidated as "liquid-glass instrument, retro terminal heart, tactile controls." Aqua promoted to the single primary accent (Brand blue #246BFD retired to the hero gradient only). JetBrains Mono promoted to a first-class UI role for data readouts. Tactile press physics, glass edge highlights, and dot-grid texture added. Token set minimized. All 17 open proposals (form controls, elevation, z-ladder, scrollbars, selection, borders, font loading, charts, degraded pages, validation, sidebar, keyboard) folded in as law.
v2.1: three gaps found during build ticket T0.2 closed as law — chip padding (§8), skeleton shimmer sweep geometry (§6), and what "self-hosted" means in practice for font delivery (§3). No aesthetic changes.
v2.2: seven gaps found during build ticket T0.3 closed as law — dot diameters, panel offset, and overlay interior padding (§8); option-row height precedence and the two toast clocks (§8); dismissal order separated from the paint ladder (§4, §11). No aesthetic changes.
v2.3: form-language revision from first real use of the sign-in flow. Field height 52 → 48 (OTP boxes stay 52); floating labels replace the static label row (§8); helper line speaks only in states — instructional copy moves to the title's subtitle slot (§8, §12); browser-autofill paint override (§8); back-button and action-row convention for multi-step flows (§8); subtitle slot formalised (§4). First revision that changes component geometry.
v2.4: OTP responsiveness, found when build ticket T0.5 measured the group at 375 — 6×52 + 5×16 overflows a phone. The group steps down below 768 (§8), and the auth flow is named as the exception to "read-only mobile web" (§4). OTP's visible label row retires with the other static labels (§8).
v2.5: second form-language pass from real use of the sign-in flow. The step header replaces the action row and steps left-align end to end, OTP excepted (§8); the floated label gets its own token, ui-label (§3, §8); fields carry one text only — format-hint placeholders abolished (§8); focus splits pointer from keyboard, killing the double stroke on mouse (§6, §7, §8); validation flags slow and clears fast, never under 3 characters (§8); `--n-placeholder` dimmed to #5C6069 (§2); Iconoir named as the icon set (§8).
v2.6: three corrections found while implementing v2.5. The focus split names input-modality tracking as its mechanism — `:focus-visible` cannot provide it, because browsers match it on a clicked text input and so reproduce the double stroke the split removes (§6, §7, §8). The floated label sits at the field's text inset rather than a hardcoded 16, so a leading icon moves label and value together (§8). The step header's title joins the OTP group as a named exception to step left-alignment (§8). -->

## 0. Design language

**One line:** a liquid-glass instrument with a retro terminal heart and tactile controls — optimistic tech, dark, calm, precise.

Three threads run through every component:

1. **Glass** — dark translucent surfaces with real blur and a specular top edge. Modern, aero, expensive.
2. **Terminal** — data speaks monospace: readouts, IDs, timestamps, meters, micro-labels in JetBrains Mono uppercase. The retro heart.
3. **Tactile** — controls physically press: down instantly, release with a spring. Pill shapes, light fills with dark labels (the retro grammar), visible click feedback.

Laws (override any component default):

1. **Calm authority.** No alarm styling. Meters and gaps never render in Danger red; risk is Warning-toned; idle work dims; nothing blinks.
2. **Danger is reserved** for destructive actions, validation errors, and diff deletions. Never for scores, gaps, or overdue states.
3. **One accent leads.** Aqua is the only brand accent in the chrome. Violet appears only on agent output. Everything else is neutral until it means something.
4. **Violet means the machine.** Anything the agent drafted or proposes carries Agent/Violet until a human confirms it; confirmed content drops the violet.
5. **Glass has an edge.** Every glass surface and primary control carries a 1px inner top highlight — the specular line is the signature.
6. **Data speaks mono.** Numbers, IDs, timestamps, states: JetBrains Mono. Prose speaks DM Sans. Titles speak Space Grotesk.
7. **Dim, don't disable.** Idle/parked items render at reduced opacity, fully interactive.
8. **One term per concept** in copy; sentence case; no exclamation marks.
9. **Texture is rationed.** The dot grid appears only on decorative surfaces (login, empty states, hero) — never behind working content.

---

## 1. Brand mark

The identity is the **Æ ligature** — two letters fused into one glyph, which is what the product does to spec and design.

**Working logo (flat Æ).** `ae-mark.svg` (vectorized, final). Geometric monogram: uniform stroke ≈ cap-height ÷ 8, gently rounded A apex, flat vertical arm terminals, equal-length E arms, the A's right side shared with the E's spine. Default rendering **#E0E5EB on dark**; #FFFFFF for emphasis; #0E0F11 on light surfaces. In product the mark renders via `currentColor` — the SVG's baked-in fill is overridden so tokens decide, and the component never carries a hardcoded hex. Always flat, one color — never gradients, never effects on the working mark.

**Sizes.** Sidebar 24px · favicon 16px (`ae-favicon.svg` — heavier variant: stroke ≈ cap-height ÷ 6, slightly shorter middle arm) · avatar: mark centered in a #0E0F11 rounded square, corner radius 22% of the square · packet and doc headers 32px. Clearspace ≥ one stroke-width on all sides. Minimum 14px.

**Wordmark.** `aenima`, lowercase, DM Sans SemiBold, tracking 0, to the right of the mark at cap height, gap = one stroke-width. `AENIMA` extended caps = marketing/merch retro lockup only, never product chrome.

**Hero (glass Æ).** The liquid-glass render (refraction, aqua→blue→violet internal gradient): landing hero, login backdrop, onboarding splash, OG card. Never product chrome, never below 200px.

---

## 2. Color system

Dark-only. Every accent has two tones: **fill** (surface color; label sits on it) and **bright** (text/icon/stroke on dark, ≥7:1 on Base). Softs are the bright tone at low alpha. Copy-paste tokens:

```css
:root {
  /* surfaces */
  --bg-base: #0E0F11;            /* app background */
  --bg-scrim: rgba(14,15,17,.80);/* modal scrim (Base-Soft) */
  --surface-1: #202228;          /* cards, inputs, composer, table rows */
  --surface-2: #333740;          /* nested fills, meter tracks, hover-on-1, skeletons */
  --surface-3: #2A2F39;          /* hover on nested cards, pressed rows */
  /* glass */
  --glass-fill: rgba(34,38,46,.80);      /* glass panels; pair with blur */
  --glass-border: rgba(77,81,89,.64);    /* 1px border on glass + cards */
  --glass-blur: 24px;
  --press-overlay: rgba(255,255,255,.08);
  --hover-overlay: rgba(255,255,255,.04);
  --edge-highlight: rgba(255,255,255,.14); /* 1px inner top specular line */
  --scrim-top: linear-gradient(180deg, rgba(14,15,17,.72), rgba(14,15,17,.24), rgba(14,15,17,0));
  --scrim-bottom: linear-gradient(0deg, rgba(14,15,17,.72), rgba(14,15,17,.24), rgba(14,15,17,0));
  /* neutrals (text/icons) */
  --n-primary: #E0E5EB;   /* default text */
  --n-secondary: #9DA3B0; /* secondary text, labels, inactive icons */
  --n-white: #FFFFFF;     /* emphasis on fills */
  --n-placeholder: #5C6069; /* placeholders only — fails AA by design; sits between secondary and disabled so a ghost never reads as typed text */
  --n-disabled: #4D5159;    /* disabled only — fails AA by design */
  /* prime accent — aqua */
  --prime: #21B8DC;         /* bright: text, icons, strokes, meter fill, links */
  --prime-deep: #0E7E9B;    /* fill tone for solid shapes needing a light label */
  --prime-soft: rgba(33,184,220,.14);
  --prime-glow: 0 0 12px rgba(33,184,220,.24);
  /* agent accent — violet */
  --agent: #A78BFF;
  --agent-deep: #5B2BD9;
  --agent-soft: rgba(167,139,255,.14);
  /* semantic */
  --success: #22C55E;  --success-deep: #12813C;  --success-soft: rgba(34,197,94,.12);
  --warning: #EBA92F;                             --warning-soft: rgba(235,169,47,.12);
  --danger: #FF7276;   --danger-deep: #D93A3F;   --danger-soft: rgba(255,114,118,.12);
  /* hero gradient — marketing surfaces + 100%-meter shimmer only */
  --hero-gradient: linear-gradient(90deg, #172EE1, #692BEA 21%, #4393F7 69%, #0AC0FF);
}
```

**Usage map.**

| Meaning | Token |
|---|---|
| Primary action fill | `--prime` fill, label #0E0F11 (8.2:1) |
| Links, active nav, selected, focus ring, meter fill, freshness dot | `--prime` |
| Anything agent-drafted, pre-confirmation | `--agent` / `--agent-soft` |
| Passed checks, handover-ready, meter at 100, diff additions | `--success` (soft bg for diffs) |
| At-risk accents, open Must gaps, comprehension flags, sync-retry | `--warning` |
| Destructive actions, validation errors, diff deletions | `--danger` (deep fill + white label on buttons) |
| Your-move bucket accent | `--prime` · At-risk bucket accent | `--warning` |
| Dim/park | element opacity .60 idle / .40 parked |

**Retired from v1.x (do not use):** Brand blue #246BFD & #6BA5FF (live only inside `--hero-gradient`), Gradient-Profile, Glass Surface-Full-2, Surface-Right scrim, Status-Online/Away gradients, all Sociera `Map/*` and Logo colors.

**Dot-grid texture** (decorative surfaces only): radial dots #E0E5EB @ 4%, 2px dot, 16px pitch, over `--bg-base`.

---

## 3. Typography

Three faces, all SIL Open Font License, all self-hosted woff2 (no CDN), `font-display: swap`, preload SpaceGrotesk-Bold + SpaceGrotesk-Medium and the UI face:

**What self-hosted means:** the browser never contacts a font CDN at runtime. Every `@font-face` resolves to a same-origin woff2 on our own domain. A build-time fetch that emits those files as static assets satisfies this (Next's `next/font/google` does exactly that); vendoring the woff2 files into the repo is equivalent and equally acceptable. Latin Extended is required on all three faces — TR `ğĞşŞİı` and NL `ĳĲ` are non-negotiable coverage. Where a face ships as a variable font, one file per subset covers every weight in the scale below and no weight arrays are declared.

```css
--font-display: 'Space Grotesk', system-ui, sans-serif; /* titles — retro-tech voice */
--font-ui: 'DM Sans', system-ui, sans-serif;            /* prose + controls */
--font-mono: 'JetBrains Mono', ui-monospace, monospace; /* data, readouts, code */
```

Root 16px. Space Grotesk styles: letter-spacing −1%. Full Latin Extended: TR/NL covered on all three faces.

| Token | Face / weight | px size/line | Use |
|---|---|---|---|
| display-xl | Space Grotesk Bold | 32/38 | Page titles |
| display-lg | Space Grotesk Medium | 24/28 | Section/modal titles, packet header |
| display-md | Space Grotesk Medium | 18/24 | Card titles, item names |
| display-num | Space Grotesk Bold | 18/22 | Big emphasized numbers (ready buffer, scores in headers) |
| ui-headline | DM Sans SemiBold | 17/22 | Item row titles, doc headings |
| ui-button | DM Sans Medium | 17/20 | Large/medium button labels |
| ui-input | DM Sans Regular | 17/22 | Inputs, composer |
| ui-subhead | DM Sans SemiBold | 15/22 | Group labels, table headers, tabs |
| ui-button-sm | DM Sans Medium | 15/20 | Small buttons, action chips |
| ui-body | DM Sans Regular | 15/22 | Default prose: chat, docs, evidence |
| ui-footnote | DM Sans Regular | 13/18 | Helper text, validation messages |
| ui-label | DM Sans Medium | 13/18 | Floated field labels |
| ui-caption | DM Sans Medium | 12/16 | Chip text, dense labels |
| mono-code | JetBrains Mono Regular | 14/22 | EARS/GWT blocks, prompt-pack preview |
| mono-readout | JetBrains Mono Medium | 12/16, tabular-nums | Timestamps, meter %, counts, IDs, versions |
| mono-micro | JetBrains Mono SemiBold | 10/14, +8%, UPPERCASE | Eyebrows: bucket headers, stage labels, section tags |
| special-otp | DM Sans Bold | 22/24 | Login code boxes |

Rules: max reading measure 68ch (doc reader). Links `--prime`, underline on hover only. All numerals in data contexts use `font-variant-numeric: tabular-nums`. The mono-micro eyebrow replaces v1's DM Sans eyebrow — the terminal label is the retro signature, use it wherever a tiny section label appears.

---

## 4. Layout, z-order, chrome

- **Grid.** Left sidebar 240px fixed · content max-width 1200px centered, gutters 24 · chat dock 380px right, collapsible everywhere · item page = content 1fr / chat 380px.
- **Breakpoints.** ≥1440 comfortable · 1024–1439 default · 768–1023 chat becomes overlay drawer · <768 read-only mobile web — **except the auth flow**, which must be fully usable at 375: an invited member signs in on whatever they are holding. Any control on the path from invite link to landed session carries a <768 rule.
- **Density.** List rows 56 · table rows 44 · menu rows 36 · touch targets ≥40.
- **Sidebar.** `--bg-base`; lockup top: Æ mark 24px + `aenima` wordmark; nav items 40px (icon 20 + ui-body); active = `--prime-soft` pill + `--n-primary`; product switcher = avatar 40 + display-md. Sidebar never collapses in v1; the chat dock is what collapses.
- **Topbar per page.** display-xl title + mono-readout freshness + one primary action. Sticky topbars use glass recipe + `--scrim-top`.
- **Subtitle slot.** Any page or step title may carry one subtitle line beneath it: ui-body, `--n-secondary`, 8 below the title. Instructional copy ("We'll send a six-digit code") lives here, and only here — never in a field's helper line (§8 Inputs). One line; it truncates rather than wraps on narrow widths.
- **Z-ladder** (never improvise): content 0 · sticky bars 100 · chat dock 200 · dropdown/popover 300 · modal scrim+modal 400 · toast 500 · tooltip 600. **The ladder governs painting only.** Dismissal is last-opened-wins: `Esc` closes the most recently opened layer regardless of its rung, so a select opened inside a modal takes the first `Esc` and the modal takes the second. Ranking dismissal by rung would strand the inner layer.
- **Overlay interior.** Modals, sheets, and toasts pad 20; stacked content inside them gaps on the 8-grid. Panels (select, menu, dropdown) sit 8 from their trigger.
- **Scrollbars.** 8px thin; thumb `--surface-2`, hover `--glass-border`; track transparent. (`scrollbar-width: thin` + webkit styles.)
- **Text selection.** `::selection { background: var(--prime-soft); color: var(--n-primary); }`
- **Border widths.** 1px everywhere; 2px reserved for meaning: focus ring, agent violet border, bucket accents.

---

## 5. Shape, glass, elevation

- **Radius tokens.** `--r-pill: 999px` (buttons, inputs, chips, toggle, avatars) · `--r-lg: 24px` (sheets) · `--r-md: 20px` (modals, panels) · `--r-sm: 16px` (cards) · `--r-xs: 8px` (tooltips, code blocks, menu panels use 12). **Proportional rule:** multi-line pills step down — a control taller than ~72px uses radius ≈ height ÷ 4 (Sociera's Tall input: 104h → r26). Never square corners anywhere.
- **Glass recipe** (panels, modals, sticky bars, toasts):
```css
background: var(--glass-fill);
backdrop-filter: blur(var(--glass-blur));
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--edge-highlight); /* the specular edge — mandatory */
```
No-`backdrop-filter` fallback: solid #1B1E24, keep border + edge.
- **Elevation = surface step + border, not shadows.** Shadows only for truly floating layers: dropdown/popover/toast `0 8px 24px rgba(0,0,0,.40)` · modal `0 16px 48px rgba(0,0,0,.56)`. Everything else flat.
- **Cards.** `--surface-1`, `--r-sm`, padding 16–20, optional `--glass-border`; cards also carry the inset edge highlight at 10% (`rgba(255,255,255,.10)`) — quieter than glass.

---

## 6. Motion & tactility

```css
--t-fast: 120ms; --t-med: 200ms; --t-slow: 320ms; --ease: cubic-bezier(.2,.7,.3,1);
```

- Hover/overlay/press-release: `--t-fast`. Panels/drawers: `--t-med`. Modals/meter width: `--t-slow`.
- **Press physics (the retro click — applies to all buttons, chips-with-actions, toggle, checkbox):** on `:active`, instantly (0ms in): `transform: translateY(1px)`, edge highlight off, `box-shadow: inset 0 2px 4px rgba(0,0,0,.32)`. On release: spring back over `--t-fast` with `--ease`. The press must feel immediate; only the release animates.
- **Focus-visible** (keyboard only): `outline: 2px solid var(--prime); outline-offset: 2px;` plus `box-shadow: var(--prime-glow)` — the aero glow lives on focus and on live dots, nowhere else. Pointer focus is not keyboard focus: clicking into a field swaps its border to `--prime` and nothing more. Ring and glow are keyboard affordances. The mechanism is input-modality tracking, not `:focus-visible` — browsers deliberately match `:focus-visible` on a clicked text input, since it is about to take keystrokes, so gating the ring on it reproduces the double stroke this rule removes. Modality is recorded on `<html>` by an inlined script and defaults to keyboard: an autofocused field with no visible focus is worse than a ring on load. `:focus-visible` remains correct for buttons and links, where a click does not match it.
- Meter fill animates width `--t-slow`; 100% triggers a one-time 600ms `--hero-gradient` shimmer sweep.
- Skeleton shimmer: `--surface-2` base, moving highlight rgba(255,255,255,.04), 1.2s linear loop. Geometry: a 200%-wide linear-gradient (transparent → highlight → transparent) traversing the element left to right, one pass per loop.
- `prefers-reduced-motion`: kill shimmer, press-translate (keep the inner-shadow state change), meter animation, lift, and the floating-label slide (§8 — the label snaps between positions).

---

## 7. Interaction states (any interactive element)

| State | Treatment |
|---|---|
| Hover | `--hover-overlay` + cursor pointer; on glass, border brightens to rgba(120,126,136,.72) |
| Active/pressed | press physics above + `--press-overlay` |
| Focus-visible | prime ring + glow (keyboard only — pointer focus changes the border alone, per §6) |
| Selected | `--prime-soft` fill, `--n-primary` text |
| Disabled | `--n-disabled` text/icon, fills at 40% opacity, no hover, cursor default, edge highlight off |
| Loading | element-level spinner (below) or skeleton; never full-page spinners |
| Drag | scale 1.02 + dropdown shadow |

---

## 8. Components

Confirmed dimensions come from Sociera v2.0's real components (Figma node introspection); web-only components follow the same grammar.

**Buttons (pill).** Sizes: **sm** 28h, pad 4/10, gap 4, icon 18, ui-button-sm · **md** 34h, pad 7/14, gap 4, icon 20, ui-button · **lg** 48h, pad 12/20, gap 4, icon 24, ui-button. All `--r-pill`. Variants:
- **Primary:** `--prime` fill, label #0E0F11, inset edge highlight at 24% white. The light-fill/dark-label pairing is deliberate retro grammar.
- **Soft:** `--prime-soft` fill, `--prime` label.
- **Secondary:** transparent, 1px `--glass-border`, `--n-primary` label; hover brightens border.
- **Ghost:** text-only, `--n-secondary` → `--n-primary` on hover.
- **Danger:** `--danger-deep` fill, white label; destructive actions always get a confirm step.
States: hover overlay · press physics · loading (spinner replaces label, width locked) · disabled. **Icon buttons:** 28/34/48 square, same radius/padding grammar (pad ≈ quarter of box), same variants.

**Inputs.** Field 48h, `--r-pill`, `--surface-1` fill, 1px `--glass-border`, pad 16 horizontal (height wins: the value centres vertically, per the §8 option-row rule), icon slots 24 leading/trailing, gap 8, ui-input text. 48 aligns fields with the lg button, so a field and its submit sit at one height. Focus: pointer → `--prime` border only; keyboard modality (§6) → border + ring + glow per §6. Error: `--danger` border. Disabled: 40% opacity.
**Floating label.** The label is a real `<label>`, always in the DOM, never a placeholder. At rest (empty, unfocused) it renders inside the field where the value will sit — ui-input size, `--n-secondary` (AA), not placeholder tone. On focus or once filled, it floats to the label zone above the field: ui-label (§3), `--n-secondary`, 4 above the field, at the field's text inset, so label and value share an x — a leading icon moves both. The float animates translateY + size over `--t-fast` `--ease`; `prefers-reduced-motion` snaps it. The label zone (22h = 18 line + 4 gap) is **always reserved**, so floating never shifts layout. A field shows one text, ever: its label. Format-hint placeholders are abolished — after the label floats, the field is empty with a caret. Nothing swaps, nothing appears. **Exempt from the floating label:** Search (the leading icon names it; placeholder "Search" allowed at rest) and the chat composer (the dock names it) — both are labelled by context, not by a `<label>` row. `--n-placeholder` exists only for these two.
**Helper line speaks only in states.** The helper slot (ui-footnote, 8 below the field) carries validation outcomes exclusively — error `--danger`, warning `--warning`, success `--success` — never instructions; instructional copy lives in the subtitle slot (§4). Forms **reserve one helper line** (18h) under any field that can produce a state, so an error appearing never shifts layout. **Validation timing — flag slow, clear fast.** A field never errors while empty or under 3 characters, including on blur: leaving an untouched field is not a mistake. While typing, validation waits for a 1.5s pause; blur validates immediately once the field carries ≥3 characters; on submit, everything validates and the first error is scrolled to. The moment input becomes valid, the error clears instantly — flagging waits, clearing never does.
**Autofill paint.** Browser autofill (Chrome's yellow/white flash) is overridden as law, not left to chance: `input:-webkit-autofill { -webkit-box-shadow: inset 0 0 0 1000px var(--surface-1); -webkit-text-fill-color: var(--n-primary); caret-color: var(--prime); transition: background-color 9999s; }` — the field must look identical filled by hand or by the browser.
**Textarea/composer:** starts 48h pill; past ~4 lines, radius = height ÷ 4 (proportional rule), max ~8 lines then inner scroll. **Search:** leading icon variant of the standard field. **Date field:** standard pill field + native browser picker (custom calendar is v1.1). **OTP:** 6 boxes, special-otp centered, filled box border `--prime` — a distinct component with its own geometry, deliberately exempt from the 48 field height. **Two sizes:** ≥768 **52×52**, radius 27, gap 16 · <768 **44×44**, radius 22, gap 8. Six 52s and five 16s span 392 and overflow a 375 phone; the small scale spans 304 and fits, still clears §4's ≥40 touch target, and 22 is the exact pill clamp at 44. The label is `sr-only` at both sizes: the step title ("Enter your code") is the visible name, and a label row beneath it would say the same thing twice. Note for implementers: the focus ring (2px at 2px offset, §6) reaches 4 into the small gap of 8 — clearance is tight but rings never touch.

**Multi-step flows (sign-in, onboarding, ceremony steps).** Steps are left-aligned — subtitle, labels and values share one left edge. Layout: step header → controls → primary. The step header is the mobile-navigation grammar: IconButton ghost 48 with arrow-left icon 24 on the left whenever a previous step exists, gap 12, then the title (display-lg) with the §4 subtitle beneath it; back and title share a first line, the title block wraps beside the button. Back always means "previous step" and replaces textual escape hatches that mean the same thing ("Use a different email" is the back button). The primary fills the content width alone. Tertiary actions ("Send a new code") sit beneath it, **centered**, as ghost buttons; maximum one per step. The OTP group is one exception to left alignment: six discrete boxes are a display, not a text field, and the group stays centered in the content width. The step header's title is the other exception: sharing a line with the back button places it 48 + 12 to the right of the column edge. Both are deliberate; everything else in the step shares one left edge. Step changes are instant — no slide transitions between steps in v1.

**Select/dropdown.** Trigger = pill field with trailing chevron (20) — it inherits the full input grammar, 48h and floating label included. Panel: `--surface-1`, radius 12, dropdown shadow, 6px padding; options 36h, ui-body, pad 12 horizontal, radius 8; hover `--surface-3`; selected `--prime-soft` + check icon 16. **Height wins:** 36 comes from §4 density and governs the whole system; the label centres within it rather than adding vertical padding. Opens below (above if <320px space), 8 from the trigger; max-height 320 with inner scroll; type-to-jump.

**Checkbox & radio.** 20×20; checkbox radius 6, radio circle. Unchecked: `--surface-1` fill + `--glass-border`. Checked: `--prime` fill, #0E0F11 check/dot — the radio dot is 8. Press physics apply. Label ui-body, gap 10, whole row clickable.

**Toggle.** 56×28, `--r-pill`, 2px inset, thumb 24 circle. Off: `--surface-2` track, `--n-secondary` thumb. On: `--prime` track, `--n-white` thumb. Track/thumb transition `--t-fast`.

**Chips & badges.** Chip 24h, pad 4/10, gap 4, `--r-pill`, `--surface-2` fill, ui-caption; interactive chips get hover + press. (The vertical padding is derived, not free: ui-caption's 16px line box plus 4 above and below is exactly the 24 height; the 10 horizontal matches the sm button.) Type badge (Feature, Enhancement, Technical, Content, Experiment, Fix, Spike): outline chip, `--glass-border`, `--n-secondary` — types are informative, never colorful. Gap chips: open Must = `--warning-soft` bg + `--warning` text · open Should = `--surface-2` + `--n-secondary` · accepted = `--surface-2` + `--n-secondary` + accepter name · excluded = transparent + `--n-disabled` outline. Count badges: display-num in a `--surface-2` pill. **File chip:** chip + file-type icon 16 + name (middle-truncate) + size in mono-readout.

**Icons.** The set is Iconoir — hairline line icons on a 24 grid, matching the instrument aesthetic; stroke inherits `currentColor`. Sizes follow the component that carries them (§8 buttons: 18/20/24). One library, no mixing: an icon Iconoir lacks is drawn in its grammar and kept in `icons.tsx`, never imported from a second set. Brand marks are exempt: no icon set ships third-party logos, so a brand glyph is hand-drawn in `icons.tsx` and carries a comment naming the brand — the only sanctioned non-Iconoir glyphs. Decorative icons carry `aria-hidden`; meaningful ones a label.

**Avatars.** Circular, sizes 24 · 32 · 40 · 44 · 48 · 56 · 64 · 80 · 96 · 112 (nearest to context: row 32, switcher 40, profile 96). Status dot bottom-right, 8 diameter: `--success` present, `--warning` away — same dot language as freshness. Every system dot in the product (status, freshness, toast leading dot) is 8.

**Tooltip.** `--surface-2`, radius 8, ui-caption, pad 6/10, max-width 240, no arrow, 500ms show delay, instant hide, z 600.

**Spinner.** Ring 16/20/24, 2px stroke, `--prime` (or #0E0F11 on prime fills), 800ms linear rotation. Element-level only.

**Menus (context/overflow).** Panel `--surface-1`, radius 12, dropdown shadow, 6px pad; rows 36h ui-body; destructive rows `--danger` text; section titles mono-micro `--n-secondary`; separators 1px `--glass-border`.

**Tabs.** ui-subhead; inactive `--n-secondary`; active `--n-primary` + 2px `--prime` underline (radius 2); hover overlay on hit area 36h.

**Toasts.** Bottom-center, glass recipe, radius 12, ui-body + optional undo (`--prime`), leading dot `--success`/`--warning`; never a red toast — errors surface inline. **Two clocks:** auto-dismiss 5s by default, 8s when the toast carries an undo action — undo needs reaction time (§12). Hover or focus pauses either. z 500.

**Modals & sheets.** Scrim `--bg-scrim`. Modal: glass recipe, `--r-md`, modal shadow, max 400 (confirm) / 640 (content); title display-lg; footer buttons right, primary last. Side sheets (evidence, decision log): 480 wide, right slide-in `--t-med`, glass recipe, `--r-lg` on the leading corners only.

**Tables (analytics).** Header ui-subhead `--n-secondary` on `--bg-base`; rows 44h `--surface-1` separated by 1px `--bg-base`; numerals mono-readout; row hover `--surface-3`; sortable headers get 12px chevron.

**Readiness meter.** Track `--surface-2`, fill `--prime`, `--r-pill`. Row micro-meter 4h per active stage; item-page meter 8h + mono-readout percentage; click expands per-check list (evidence quotes ui-body on `--surface-1` cards, check IDs mono-readout). All Musts passed / 100: fill switches `--success` + one-time hero shimmer.

**Pipeline strip.** Glass bar; segment per stage: mono-micro stage label + display-num count; segments filter; active `--prime-soft`.

**Item row.** 56h: 2px bucket accent (`--prime` your-move / `--warning` at-risk / none flowing) → item name ui-headline + type badge → micro-meters → gap chips (max 2 + overflow) → freshness dot + mono-readout timestamp → overflow menu. Idle: opacity .60 + trailing Soft chip "Park?" (one tap, undo toast). Parked list renders at .40.

**Cards.** Per §5. **Agent-proposal card:** `--agent-soft` tint + 2px `--agent` left border + confirm/undo; on confirm, violet drops and the card settles to a plain `--surface-1` card (`--t-med` transition — the moment of "human accepted" is visible). Triage card: source icon + extract quote ui-body + proposed destination + confirm/redirect.

**Chat panel.** Dock 380, `--bg-base`, 1px `--glass-border` divider. User messages: `--surface-2` bubble, radius 16 (4 on sender corner), right. Agent messages: no bubble — plain ui-body on Base, left; the agent is the room, not a participant. Agent proposals/echo-confirms/question cards render as agent-proposal cards inline; "decide later" = ghost button. Composer: input grammar above, `--scrim-bottom` behind it. `Cmd/Ctrl+K` focuses the composer from anywhere — chat is the command palette.

**Doc reader.** 68ch, ui-body; headings display-md; requirement IDs as mono-readout chips; EARS/GWT in mono-code on `--surface-1` blocks radius 8; walkthrough highlight `--prime-soft` block + 2px `--prime` left border. **Diff:** added `--success-soft` bg, removed `--danger-soft` bg + strikethrough; changed = both stacked; line numbers mono-readout.

**Ceremony packet.** One-pager on cards; sign block sticky bottom (glass + `--scrim-bottom`); signer chips: waiting `--n-secondary` · in review `--prime-soft` · signed `--success-soft` · waived `--n-disabled` outline. Walkthrough card: question ui-headline, answer input, "ask the doc" ghost; wrong answer opens the highlighted section side-by-side — copy says "let's look at this part together," never a red state.

**Empty states.** Dot-grid texture allowed. Icon 24 `--n-secondary` + one ui-body line + one action. Dashboard-empty may use the hero gradient on the illustration only. "Nothing needs you right now," not "No data."

---

## 9. Charts

Series order: `--prime` #21B8DC · `--agent` #A78BFF · `--success` #22C55E · `--warning` #EBA92F · `--n-secondary` #9DA3B0 · `--prime-deep` #0E7E9B. Single-metric trends always `--prime`. Flow distribution: value=prime, quality=success, risk=warning, debt=secondary. Gridlines #E0E5EB @ 8%; axis labels ui-footnote `--n-secondary`; line weight 2; bar radius 4 top-only; chart tooltips = tooltip component with mono-readout values; empty chart = empty-state pattern, never a bare grid.

---

## 10. System states & degraded pages

- **No AI key:** meters render hollow tracks + "connect AI to activate scoring" (ui-footnote) — never zeros, never red.
- **Provider outage / retry:** freshness shows `--warning` dot + mono-readout "scored 6 h ago — retrying"; no banners.
- **404/500/offline:** empty-state pattern on dot grid, Æ mark 32, one line, one action ("back to dashboard" / "retry"). 500 may show a mono-readout incident id.
- Full-page loads: skeleton screens mirroring the target layout; never a centered spinner page.

## 11. Keyboard & focus

`Cmd/Ctrl+K` focus chat · `Esc` closes the most recently opened layer (last-opened-wins, per §4 — not the highest rung) · `Enter` confirms focused proposal, `Cmd/Ctrl+Enter` sends in composer · arrow keys walk menus/selects/list rows · `/` focuses search in list views. Every interactive element reachable by Tab in visual order; focus ring per §6; focus trapped inside modals; on close, focus returns to the opener.

## 12. Voice in UI

Sentence case everywhere including buttons. No exclamation marks. Calm vocabulary: walkthrough / good catch / this section was unclear — never test, fail, violation. EN/TR/NL: reserve +30% width for TR/NL strings; buttons and chips truncate, never wrap; dates/numbers per locale; aenima's own TR register is **sen**. Microcopy defaults: confirm = "Looks right" · undo toast = "Undone" available 8s · park = "Parked — it'll be here when you want it."

## 13. Accessibility

- AA on Base/Surface-1 for `--n-primary` (13.9:1) and `--n-secondary` (7.4:1); `--prime` text 8.2:1; `--agent` 7.1:1; `--warning` 9.4:1; `--danger` 7.2:1. **Placeholder and Disabled fail AA by design** — never information-carrying.
- Accent text/icons always use bright tones; deep tones are fills with labels on them.
- Meters always pair color with the numeric value; gap states carry text labels, not color alone.
- Focus-visible on everything; full keyboard paths (list → item → chat → sign); `prefers-reduced-motion` per §6; minimum text on glass verified against the busiest backdrop.
- Floating labels are real `<label>` elements bound to their inputs at every moment of the animation — the at-rest state is a styled label, never a placeholder standing in for one.

## 14. Email & digest

Clients don't support blur, webfonts, or reliable dark mode — this is the one sanctioned light surface. Baseline light: bg #FEFEFE (never pure white), text #1A1B1E (never pure black), single column table, 600 max. Dark is a bonus layer: `<meta name="color-scheme" content="light dark">` + `@media (prefers-color-scheme: dark)` swapping to #202228 bg / #E0E5EB text; Gmail will ignore it — expected. Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`. Logo: flat Æ dark-on-light with 1px #4D5159 outline (survives inversion). Structure: logo+wordmark → one-line headline ("2 findings today") → delta rows (solid dot `--warning`/`--success`/`--danger`/`--prime` fills at full opacity — no soft tints, they invert badly) + one line each → single CTA "Open aenima" (solid #0E7E9B fill, white label — deep tone for email safety) → footer: workspace, settings link. Deltas, never dumps.

## 15. Brand asset export set

From `ae-mark.svg` / `ae-favicon.svg`: favicon.ico (16/32/48, heavy variant) · apple-touch-icon 180 (mark on #0E0F11 square r22%) · PWA 192 + 512 + maskable (mark at 60% safe area) · `theme-color` #0E0F11 · OG/social 1200×630: glass Æ on Base with dot grid — the one sanctioned product-adjacent use of the hero render.

## 16. Non-goals (decided, not oversights)

No light mode · no RTL (EN/TR/NL are LTR) · no sound (tactility is visual) · no custom date calendar (v1.1) · no packet print stylesheet (v1.1) · no sidebar collapse (chat dock collapses instead) · no texture behind working content.

---

*v2.6 — complete and closed: no open items. Changes cut new versions of this document.*
