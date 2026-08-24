/**
 * The product's glyphs — design-spec.md §8 "Icons" (v2.5).
 *
 * The set is Iconoir: hairline line icons on a 24 grid, stroke inheriting
 * `currentColor`. This file is the single import point. Nothing else in the
 * codebase imports from `iconoir-react` directly, so "one library, no mixing"
 * has exactly one place to be enforced and exactly one place to look when the
 * next glyph is needed. Named exports of a tree-shakeable ESM package: the
 * bundle carries the glyphs that are used and no others.
 *
 * Every glyph here sits beside a real label — a button's text, an IconButton's
 * `aria-label`, a field's `<label>` — so all of them are decorative and carry
 * `aria-hidden`. §8 asks a *meaningful* icon for a label instead; there is not
 * one in the product yet, and it would not be given this default.
 *
 * Size comes from the slot, never from here: the slot classes set the SVG's
 * width and height in CSS, which beats Iconoir's 24×24 attributes.
 */
import {
  ArrowLeft,
  Check,
  GraphUp,
  List,
  LogOut,
  Mail,
  MoreHoriz,
  NavArrowDown,
  NavArrowRight,
  Plus,
  Reports,
  Search,
  Settings,
} from "iconoir-react";

type IconProps = { className?: string };

/** §8 select trigger: the chevron, at 20. */
export function ChevronDownIcon({ className }: IconProps) {
  return <NavArrowDown className={className} aria-hidden="true" focusable="false" />;
}

/** §8 select panel: the selected row's check, at 16. */
export function CheckIcon({ className }: IconProps) {
  return <Check className={className} aria-hidden="true" focusable="false" />;
}

/**
 * The checkbox tick. The same glyph as the select's check — one library means
 * one check mark — scaled by CSS into the 20×20 box §8 gives the control.
 */
export function CheckboxTickIcon({ className }: IconProps) {
  return <Check className={className} aria-hidden="true" focusable="false" />;
}

/** Envelope, for the email provider's control. */
export function MailIcon({ className }: IconProps) {
  return <Mail className={className} aria-hidden="true" focusable="false" />;
}

/** §8 multi-step flows: the step header's back control, at 24. */
export function ArrowLeftIcon({ className }: IconProps) {
  return <ArrowLeft className={className} aria-hidden="true" focusable="false" />;
}

/** Leading glyph for the §8 Search field. */
export function SearchIcon({ className }: IconProps) {
  return <Search className={className} aria-hidden="true" focusable="false" />;
}

export function PlusIcon({ className }: IconProps) {
  return <Plus className={className} aria-hidden="true" focusable="false" />;
}

export function ChevronRightIcon({ className }: IconProps) {
  return <NavArrowRight className={className} aria-hidden="true" focusable="false" />;
}

/* §4 sidebar nav, at 20. One glyph per destination in `src/lib/routes.ts`. */

/** §13's list surface — the three buckets. */
export function ListIcon({ className }: IconProps) {
  return <List className={className} aria-hidden="true" focusable="false" />;
}

/** §10's intake triage inbox. */
export function TriageIcon({ className }: IconProps) {
  return <Reports className={className} aria-hidden="true" focusable="false" />;
}

/** §15's analytics views. */
export function AnalyticsIcon({ className }: IconProps) {
  return <GraphUp className={className} aria-hidden="true" focusable="false" />;
}

export function SettingsIcon({ className }: IconProps) {
  return <Settings className={className} aria-hidden="true" focusable="false" />;
}

/**
 * §8's item row overflow. Horizontal rather than vertical: the row is a
 * horizontal arrangement and the menu sits at its end, so the dots read as a
 * continuation of the row rather than as a column of their own.
 */
export function OverflowIcon({ className }: IconProps) {
  return <MoreHoriz className={className} aria-hidden="true" focusable="false" />;
}

/** §4's account slot: the one thing you can do to an identity today. */
export function SignOutIcon({ className }: IconProps) {
  return <LogOut className={className} aria-hidden="true" focusable="false" />;
}
