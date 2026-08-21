/**
 * Class resolution for the UI primitives — design-spec.md §6, §7, §8.
 *
 * Pure string maps, kept out of the components so the variant/state grammar can
 * be unit-tested without a DOM. Every class string is written out in full: the
 * Tailwind scanner cannot see a class name that is assembled at runtime.
 *
 * Every px value below is quoted from the spec. Nothing here is derived except
 * where a comment says so and names the reason.
 */
import { cx } from "@/lib/cx";

/* -------------------------------------------------------------------------- */
/* Button — §8 "Buttons (pill)"                                               */
/* -------------------------------------------------------------------------- */

export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "primary" | "soft" | "secondary" | "ghost" | "danger";

export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];
export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "soft",
  "secondary",
  "ghost",
  "danger",
];

/** Ring diameter of the spinner that replaces a loading button's label. */
export const BUTTON_SPINNER_SIZE: Record<ButtonSize, 16 | 20 | 24> = {
  sm: 16,
  md: 20,
  lg: 24,
};

const BUTTON_BASE =
  "control inline-flex shrink-0 items-center justify-center rounded-pill " +
  "whitespace-nowrap [&_svg]:size-[var(--control-icon)] [&_svg]:shrink-0";

// sm 28h pad 4/10 gap 4 icon 18 · md 34h pad 7/14 gap 4 icon 20 · lg 48h pad 12/20 gap 4 icon 24
const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-[28px] gap-[4px] px-[10px] py-[4px] type-ui-button-sm [--control-icon:18px]",
  md: "h-[34px] gap-[4px] px-[14px] py-[7px] type-ui-button [--control-icon:20px]",
  lg: "h-[48px] gap-[4px] px-[20px] py-[12px] type-ui-button [--control-icon:24px]",
};

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // §8: --prime fill, label #0E0F11 (= --bg-base), inset edge highlight at 24% white.
  primary: "control-edge-strong bg-prime text-bg-base",
  // §8: --prime-soft fill, --prime label.
  soft: "control-edge-none bg-prime-soft text-prime",
  // §8: transparent, 1px --glass-border, --n-primary label; hover brightens border.
  // The brightened value is §7's glass hover border.
  secondary:
    "control-edge-none border border-glass-border bg-transparent text-n-primary " +
    "hover:not-disabled:border-[rgba(120,126,136,.72)]",
  // §8: text-only, --n-secondary → --n-primary on hover.
  ghost: "control-edge-none bg-transparent text-n-secondary hover:not-disabled:text-n-primary",
  // §8: --danger-deep fill, white label.
  danger: "control-edge-none bg-danger-deep text-n-white",
};

// §7 disabled: --n-disabled text/icon, fills at 40% opacity, no hover,
// cursor default, edge highlight off (the last two live on `.control`).
const BUTTON_DISABLED_CLASSES: Record<ButtonVariant, string> = {
  primary: "disabled:bg-prime/40 disabled:text-n-disabled",
  soft: "disabled:bg-prime-soft/40 disabled:text-n-disabled",
  secondary: "disabled:border-glass-border/40 disabled:text-n-disabled",
  ghost: "disabled:text-n-disabled",
  danger: "disabled:bg-danger-deep/40 disabled:text-n-disabled",
};

export type ButtonClassOptions = {
  size?: ButtonSize | undefined;
  variant?: ButtonVariant | undefined;
  /** §8 loading: spinner replaces the label, width stays locked. */
  loading?: boolean | undefined;
  fullWidth?: boolean | undefined;
  className?: string | undefined;
};

export function buttonClasses({
  size = "md",
  variant = "primary",
  loading = false,
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cx(
    BUTTON_BASE,
    BUTTON_SIZE_CLASSES[size],
    BUTTON_VARIANT_CLASSES[variant],
    BUTTON_DISABLED_CLASSES[variant],
    fullWidth && "w-full",
    // Loading is not disabled: the fill and label colour stay put so only the
    // spinner reads as new. Pointer events go so the press cannot re-fire.
    loading && "pointer-events-none",
    className,
  );
}

/* -------------------------------------------------------------------------- */
/* IconButton — §8 "Icon buttons: 28/34/48 square, same variants"             */
/* -------------------------------------------------------------------------- */

const ICON_BUTTON_BASE =
  "control inline-flex shrink-0 items-center justify-center rounded-pill " +
  "[&_svg]:size-[var(--control-icon)] [&_svg]:shrink-0";

// Square boxes from §8; icon sizes stay the button grammar's 18/20/24 so an
// icon is the same size in both components. Padding therefore falls out as
// 5/7/12 rather than the spec's approximate "quarter of the box".
const ICON_BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "size-[28px] [--control-icon:18px]",
  md: "size-[34px] [--control-icon:20px]",
  lg: "size-[48px] [--control-icon:24px]",
};

export type IconButtonClassOptions = Omit<ButtonClassOptions, "fullWidth">;

export function iconButtonClasses({
  size = "md",
  variant = "primary",
  loading = false,
  className,
}: IconButtonClassOptions = {}): string {
  return cx(
    ICON_BUTTON_BASE,
    ICON_BUTTON_SIZE_CLASSES[size],
    BUTTON_VARIANT_CLASSES[variant],
    BUTTON_DISABLED_CLASSES[variant],
    loading && "pointer-events-none",
    className,
  );
}

/* -------------------------------------------------------------------------- */
/* Input — §8 "Inputs"                                                        */
/* -------------------------------------------------------------------------- */

export type InputFieldClassOptions = {
  /** §8 error: --danger border, helper flips to --danger. */
  invalid?: boolean | undefined;
  /** §7 disabled: fills at 40% opacity, cursor default. */
  disabled?: boolean | undefined;
  className?: string | undefined;
};

// §8: field 52h, --r-pill, --surface-1 fill, 1px --glass-border, pad 14/16,
// icon slots 24 leading/trailing, gap 8.
const INPUT_FIELD_BASE =
  "flex h-[52px] items-center gap-[8px] rounded-pill border bg-surface-1 " +
  "px-[16px] py-[14px] transition-[border-color,box-shadow,opacity] " +
  "duration-[var(--t-fast)] ease-brand";

// §8: focus gives a --prime border plus ring/glow (§6's focus treatment).
const INPUT_FIELD_FOCUS =
  "focus-within:border-prime focus-within:shadow-[var(--prime-glow)] " +
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 " +
  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-prime";

export function inputFieldClasses({
  invalid = false,
  disabled = false,
  className,
}: InputFieldClassOptions = {}): string {
  return cx(
    INPUT_FIELD_BASE,
    invalid ? "border-danger" : "border-glass-border",
    disabled ? "cursor-default opacity-40" : INPUT_FIELD_FOCUS,
    className,
  );
}

/** The `<input>` itself — §8 ui-input text, --n-placeholder placeholder. */
export const INPUT_CONTROL_CLASSES =
  "type-ui-input min-w-0 flex-1 bg-transparent text-n-primary " +
  "placeholder:text-n-placeholder focus:outline-none disabled:cursor-default";

/** §8 composite: label (ui-subhead) → 8 → field → 8 → helper (ui-footnote). */
export const INPUT_LABEL_CLASSES = "type-ui-subhead mb-[8px] block text-n-primary";

/** §8 icon slots are 24 square, leading and trailing. */
export const INPUT_ICON_SLOT_CLASSES =
  "inline-flex size-[24px] shrink-0 items-center justify-center text-n-secondary [&_svg]:size-full";

export function inputHelperClasses(invalid = false): string {
  // §8: helper is ui-footnote --n-secondary; on error it flips to --danger.
  return cx("type-ui-footnote mt-[8px] block", invalid ? "text-danger" : "text-n-secondary");
}

/* -------------------------------------------------------------------------- */
/* Chip — §8 "Chips & badges"                                                 */
/* -------------------------------------------------------------------------- */

export type ChipVariant = "base" | "type-badge" | "gap";
/** §8 gap chips: open Must · open Should · accepted · excluded. */
export type ChipGapTone = "must" | "should" | "accepted" | "excluded";

export const CHIP_VARIANTS: readonly ChipVariant[] = ["base", "type-badge", "gap"];
export const CHIP_GAP_TONES: readonly ChipGapTone[] = ["must", "should", "accepted", "excluded"];

// §8: chip 24h, --r-pill, --surface-2 fill, ui-caption. Padding and gap are not
// in the spec; 4/10 and gap 4 confirmed on the ticket, matching the sm button.
const CHIP_BASE =
  "inline-flex h-[24px] shrink-0 items-center gap-[4px] rounded-pill px-[10px] py-[4px] " +
  "type-ui-caption whitespace-nowrap [&_svg]:size-[16px] [&_svg]:shrink-0";

const CHIP_VARIANT_CLASSES: Record<ChipVariant, string> = {
  base: "bg-surface-2 text-n-primary",
  // §8: types are informative, never colourful — outline chip, --glass-border,
  // --n-secondary.
  "type-badge": "border border-glass-border bg-transparent text-n-secondary",
  // A gap chip always carries a tone; the variant alone adds nothing.
  gap: "",
};

const CHIP_GAP_TONE_CLASSES: Record<ChipGapTone, string> = {
  must: "bg-warning-soft text-warning",
  should: "bg-surface-2 text-n-secondary",
  accepted: "bg-surface-2 text-n-secondary",
  excluded: "border border-n-disabled bg-transparent text-n-disabled",
};

export type ChipClassOptions = {
  variant?: ChipVariant | undefined;
  tone?: ChipGapTone | undefined;
  /** §8: interactive chips get hover + press. */
  interactive?: boolean | undefined;
  className?: string | undefined;
};

export function chipClasses({
  variant = "base",
  tone = "should",
  interactive = false,
  className,
}: ChipClassOptions = {}): string {
  return cx(
    CHIP_BASE,
    variant === "gap" ? CHIP_GAP_TONE_CLASSES[tone] : CHIP_VARIANT_CLASSES[variant],
    interactive && "control control-edge-none",
    className,
  );
}

/* -------------------------------------------------------------------------- */
/* Spinner — §8 "Spinner"                                                     */
/* -------------------------------------------------------------------------- */

/** §8: ring 16/20/24. */
export type SpinnerSize = 16 | 20 | 24;
/** §8: --prime, or #0E0F11 (= --bg-base) when it sits on a prime fill. */
export type SpinnerTone = "prime" | "on-prime" | "inherit";

export const SPINNER_SIZES: readonly SpinnerSize[] = [16, 20, 24];
export const SPINNER_TONES: readonly SpinnerTone[] = ["prime", "on-prime", "inherit"];

const SPINNER_SIZE_CLASSES: Record<SpinnerSize, string> = {
  16: "size-[16px]",
  20: "size-[20px]",
  24: "size-[24px]",
};

const SPINNER_TONE_CLASSES: Record<SpinnerTone, string> = {
  prime: "text-prime",
  "on-prime": "text-bg-base",
  inherit: "",
};

export type SpinnerClassOptions = {
  size?: SpinnerSize | undefined;
  tone?: SpinnerTone | undefined;
  className?: string | undefined;
};

export function spinnerClasses({
  size = 20,
  tone = "prime",
  className,
}: SpinnerClassOptions = {}): string {
  // `.spinner-ring` carries the 2px stroke and the 800ms linear rotation.
  return cx(
    "spinner-ring inline-block",
    SPINNER_SIZE_CLASSES[size],
    SPINNER_TONE_CLASSES[tone],
    className,
  );
}
