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
export type ButtonVariant = "primary" | "soft" | "neutral" | "secondary" | "ghost" | "danger";

export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];
export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "soft",
  "neutral",
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
  // §8: --surface-2 fill, --n-primary label. Chrome that stays visible without
  // reading as an accent — the step-header back button is the first user.
  neutral: "control-edge-none bg-surface-2 text-n-primary",
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
  neutral: "disabled:bg-surface-2/40 disabled:text-n-disabled",
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

// §8 (v2.3): field 48h, --r-pill, --surface-1 fill, 1px --glass-border, pad 16
// horizontal, icon slots 24 leading/trailing, gap 8. No vertical padding: the
// option-row rule says height wins, so the value centres inside the 48 rather
// than the 48 being built from padding. 48 also aligns the field with the lg
// button, so a field and its submit sit at one height.
const INPUT_FIELD_BASE =
  "field-pill flex h-[48px] items-center gap-[8px] rounded-pill border bg-surface-1 " +
  "px-[16px] transition-[border-color,box-shadow,opacity] " +
  "duration-[var(--t-fast)] ease-brand";

// §8 (v2.5): focus splits. The border swaps on any focus and stays here; the
// ring and the glow are keyboard affordances and live in globals.css, keyed off
// the modality attribute. `:focus-visible` cannot express them on its own — a
// text input matches it on a mouse click, which is the double stroke §6 kills.
// See src/lib/focus-modality.ts.
const INPUT_FIELD_FOCUS = "focus-within:border-prime";

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

/**
 * The composite wrapper — §8's always-reserved label zone lives here.
 *
 * `field` carries the 22h zone and the positioning context the label floats
 * in; `field-unlabelled` is the §8 exemption for Search and the chat composer,
 * which are labelled by context and reserve nothing.
 */
export function inputCompositeClasses({
  floatingLabel = true,
  leadingIcon = false,
  className,
}: {
  floatingLabel?: boolean | undefined;
  leadingIcon?: boolean | undefined;
  className?: string | undefined;
} = {}): string {
  return cx(
    "field w-full",
    floatingLabel ? null : "field-unlabelled",
    leadingIcon ? "field-with-leading-icon" : null,
    className,
  );
}

/**
 * The `<input>` itself — §8 ui-input text.
 *
 * `field-input` is what the composite's `:has()` reads to decide whether the
 * label is at rest or floated, so it has to be on the control and nowhere else.
 * Placeholder colour is not set here: §8 (v2.5) gives a floating-label field
 * one text only, so globals.css keeps its sentinel placeholder transparent in
 * every state.
 */
export const INPUT_CONTROL_CLASSES =
  "field-input type-ui-input min-w-0 flex-1 bg-transparent text-n-primary " +
  "focus:outline-none disabled:cursor-default";

/**
 * The floating label — §8, §13.
 *
 * Sizes and positions come from globals.css, because both states and the
 * transition between them are one rule; splitting them across Tailwind
 * utilities would leave the at-rest geometry expressible only as a magic
 * number here.
 */
export const INPUT_LABEL_CLASSES = "field-label";

/** §8 icon slots are 24 square, leading and trailing. */
export const INPUT_ICON_SLOT_CLASSES =
  "inline-flex size-[24px] shrink-0 items-center justify-center text-n-secondary [&_svg]:size-full";

/**
 * §8 (v2.3): the helper line speaks only in states — error, warning, success.
 * Instructional copy belongs in the §4 subtitle slot, so there is no neutral
 * tone here and no default text.
 */
export type InputHelperTone = "error" | "warning" | "success";

export const INPUT_HELPER_TONES: readonly InputHelperTone[] = ["error", "warning", "success"];

const INPUT_HELPER_TONE_CLASSES: Record<InputHelperTone, string> = {
  error: "text-danger",
  warning: "text-warning",
  success: "text-success",
};

/**
 * The helper slot: ui-footnote, 8 below the field, one line (18h) reserved
 * under any field that can produce a state so an error never shifts layout.
 */
export function inputHelperClasses(tone?: InputHelperTone | undefined, reserved = true): string {
  return cx(
    "type-ui-footnote mt-[8px] block",
    reserved ? "field-helper-reserved" : null,
    tone ? INPUT_HELPER_TONE_CLASSES[tone] : null,
  );
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

/* -------------------------------------------------------------------------- */
/* Tooltip — §8 "Tooltip"                                                     */
/* -------------------------------------------------------------------------- */

/** §8 gives no placement; top is the default and bottom is the flip. */
export type TooltipSide = "top" | "bottom";

/** §8: 500ms show delay, instant hide. */
export const TOOLTIP_SHOW_DELAY_MS = 500;

// §8: --surface-2, radius 8, ui-caption, pad 6/10, max-width 240, no arrow,
// z 600 (§4). Colour is §2's default text — §8 names only the surface.
const TOOLTIP_BASE =
  "pointer-events-none absolute z-[var(--z-tooltip)] w-max max-w-[240px] rounded-xs " +
  "bg-surface-2 px-[10px] py-[6px] type-ui-caption text-n-primary";

// The 8px stand-off is the §8 input composite's rhythm (label → 8 → field → 8
// → helper), confirmed on the ticket as the offset for every floating layer.
const TOOLTIP_SIDE_CLASSES: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-[8px] -translate-x-1/2",
  bottom: "top-full left-1/2 mt-[8px] -translate-x-1/2",
};

export function tooltipClasses(side: TooltipSide = "top", className?: string): string {
  return cx(TOOLTIP_BASE, TOOLTIP_SIDE_CLASSES[side], className);
}

/* -------------------------------------------------------------------------- */
/* Panels — §8 "Select/dropdown" and "Menus"                                  */
/* -------------------------------------------------------------------------- */

/** §8: opens below, above if less than 320px of space. Also the max height. */
export const PANEL_MAX_HEIGHT = 320;

export type PanelPlacement = "below" | "above";

// `.panel` in globals.css carries §8's surface-1 / radius 12 / dropdown shadow
// / 6px padding. Popovers sit at z 300 on the §4 ladder.
const PANEL_BASE = "panel scroll-thin absolute z-[var(--z-popover)] overflow-y-auto";

const PANEL_PLACEMENT_CLASSES: Record<PanelPlacement, string> = {
  below: "top-full mt-[8px]",
  above: "bottom-full mb-[8px]",
};

export type PanelClassOptions = {
  placement?: PanelPlacement | undefined;
  className?: string | undefined;
};

export function panelClasses({ placement = "below", className }: PanelClassOptions = {}): string {
  return cx(PANEL_BASE, PANEL_PLACEMENT_CLASSES[placement], "max-h-[320px]", className);
}

// §8 options: 36h, ui-body, radius 8; hover --surface-3; selected --prime-soft
// + check 16. Ruled on the T0.3 ticket: 36h wins, horizontal padding is 12, and
// the vertical is centring rather than a declared value (ui-body's 22px line box
// plus 8 above and below would be 38, not 36).
const PANEL_ROW_BASE =
  "flex h-[36px] w-full items-center gap-[8px] rounded-xs px-[12px] type-ui-body " +
  "text-left transition-colors duration-[var(--t-fast)] ease-brand";

export type PanelRowClassOptions = {
  /** Keyboard cursor. §8 gives no separate treatment, so it reuses hover. */
  active?: boolean | undefined;
  /** §7 selected: --prime-soft fill, --n-primary text. */
  selected?: boolean | undefined;
  /** §8 menus: destructive rows --danger text. */
  destructive?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

export function panelRowClasses({
  active = false,
  selected = false,
  destructive = false,
  disabled = false,
  className,
}: PanelRowClassOptions = {}): string {
  return cx(
    PANEL_ROW_BASE,
    disabled
      ? "cursor-default text-n-disabled"
      : cx("cursor-pointer hover:bg-surface-3", destructive ? "text-danger" : "text-n-primary"),
    selected && "bg-prime-soft",
    active && !disabled && !selected && "bg-surface-3",
    className,
  );
}

export type MenuAlign = "start" | "end";

const MENU_ALIGN_CLASSES: Record<MenuAlign, string> = {
  start: "left-0",
  end: "right-0",
};

/** §8 gives a menu no width, so the panel takes its content's. */
export function menuPanelClasses({
  placement = "below",
  align = "start",
  className,
}: PanelClassOptions & { align?: MenuAlign | undefined } = {}): string {
  return cx(panelClasses({ placement }), "w-max", MENU_ALIGN_CLASSES[align], className);
}

/** §8 menus: section titles mono-micro --n-secondary. */
export const MENU_SECTION_CLASSES = "px-[12px] py-[8px] type-mono-micro text-n-secondary";

// §8 menus: separators 1px --glass-border. The 6px margin is the panel's own
// padding, so a separator breathes the same distance the panel edge does.
export const MENU_SEPARATOR_CLASSES = "my-[6px] h-[1px] bg-glass-border";

/** §8: the selected option's check icon is 16. */
export const PANEL_CHECK_SIZE = 16;
/** §8: the select trigger's chevron is 20. */
export const SELECT_CHEVRON_SIZE = 20;

/* -------------------------------------------------------------------------- */
/* Checkbox & radio — §8 "Checkbox & radio"                                   */
/* -------------------------------------------------------------------------- */

export type CheckKind = "checkbox" | "radio";

/**
 * §8 puts the hit area on the whole row, so the row is the tactile host and the
 * real input is visually hidden inside it. `.control-host` in globals.css
 * routes hover, press and the focus ring onto the box.
 */
export const CHECK_ROW_CLASSES = "group control-host inline-flex items-center gap-[10px]";

// §8: 20×20; checkbox radius 6, radio a circle. Unchecked --surface-1 +
// --glass-border; checked --prime fill with a #0E0F11 (= --bg-base) mark.
const CHECK_BOX_BASE =
  "control control-edge-none flex size-[20px] shrink-0 items-center justify-center " +
  "border bg-surface-1 text-bg-base border-glass-border " +
  "group-has-[:checked]:border-prime group-has-[:checked]:bg-prime " +
  "group-has-[:disabled]:opacity-40";

const CHECK_BOX_SHAPE: Record<CheckKind, string> = {
  checkbox: "rounded-[6px]",
  radio: "rounded-pill",
};

export function checkBoxClasses(kind: CheckKind = "checkbox", className?: string): string {
  return cx(CHECK_BOX_BASE, CHECK_BOX_SHAPE[kind], className);
}

/** §8: label ui-body. §7 disabled turns the text --n-disabled. */
export const CHECK_LABEL_CLASSES =
  "type-ui-body text-n-primary group-has-[:disabled]:text-n-disabled";

// The radio's inner dot. §8 says "#0E0F11 dot" without a diameter; 8px is the
// system's one dot size, confirmed on the ticket.
export const RADIO_DOT_CLASSES =
  "size-[8px] rounded-pill bg-bg-base opacity-0 group-has-[:checked]:opacity-100";

/** Keeps the real control in the accessibility tree while the box is what shows. */
export const VISUALLY_HIDDEN_INPUT_CLASSES =
  "absolute size-[1px] overflow-hidden opacity-0 [clip:rect(0,0,0,0)]";

/* -------------------------------------------------------------------------- */
/* Toggle — §8 "Toggle"                                                       */
/* -------------------------------------------------------------------------- */

// §8: 56×28, --r-pill, 2px inset, thumb 24. Off --surface-2 track; on --prime.
// Track and thumb transition --t-fast (§6).
const TOGGLE_TRACK_BASE =
  "control control-edge-none flex h-[28px] w-[56px] shrink-0 items-center rounded-pill " +
  "bg-surface-2 p-[2px] transition-colors duration-[var(--t-fast)] ease-brand " +
  "group-has-[:checked]:bg-prime group-has-[:disabled]:opacity-40";

export function toggleTrackClasses(className?: string): string {
  return cx(TOGGLE_TRACK_BASE, className);
}

// §8: thumb 24 circle, --n-secondary off / --n-white on. Travel is the track
// minus its 2px inset either side minus the thumb: 56 − 2 − 2 − 24 = 28.
export const TOGGLE_THUMB_CLASSES =
  "block size-[24px] rounded-pill bg-n-secondary transition-[transform,background-color] " +
  "duration-[var(--t-fast)] ease-brand group-has-[:checked]:translate-x-[28px] " +
  "group-has-[:checked]:bg-n-white";

/* -------------------------------------------------------------------------- */
/* Tabs — §8 "Tabs"                                                           */
/* -------------------------------------------------------------------------- */

// The strip scrolls rather than pushing the page sideways: §8 says a tab label
// truncates or scrolls but never wraps (§12 says the same of buttons and
// chips), and the scrollbar is §4's thin one.
export const TAB_LIST_CLASSES = "scroll-thin flex items-center overflow-x-auto";

// §8: ui-subhead; inactive --n-secondary; active --n-primary + 2px --prime
// underline (radius 2); hover overlay on a 36h hit area. No press physics —
// §6 lists them for buttons, chips, toggle and checkbox, not tabs. The 12px
// horizontal padding is the panel-row grammar; §5's "never square corners"
// puts the hover fill on --r-xs, the smallest radius in the set.
const TAB_BASE =
  "relative inline-flex h-[36px] shrink-0 items-center rounded-xs px-[12px] " +
  "type-ui-subhead transition-colors duration-[var(--t-fast)] ease-brand " +
  "not-disabled:cursor-pointer not-disabled:hover:bg-[var(--hover-overlay)] " +
  // §7 disabled: --n-disabled text, no hover, cursor default.
  "disabled:cursor-default disabled:text-n-disabled";

export function tabClasses(active = false, disabled = false, className?: string): string {
  return cx(
    TAB_BASE,
    active ? "text-n-primary" : "text-n-secondary",
    disabled && "pointer-events-none",
    className,
  );
}

/** §8: 2px --prime underline, radius 2. §4 allows 2px as a meaning-carrying width. */
export const TAB_UNDERLINE_CLASSES = "absolute inset-x-0 bottom-0 h-[2px] rounded-[2px] bg-prime";

/* -------------------------------------------------------------------------- */
/* Toast — §8 "Toasts"                                                        */
/* -------------------------------------------------------------------------- */

/**
 * §8: leading dot --success / --warning. There is deliberately no danger tone —
 * "never a red toast — errors surface inline" (§8), and §0 law 2 reserves
 * Danger for destructive actions and validation.
 */
export type ToastTone = "success" | "warning";

export const TOAST_TONES: readonly ToastTone[] = ["success", "warning"];

/**
 * §8: auto-dismiss 5s, hover pauses. §12: an undo toast keeps its undo
 * "available 8s". Both are law — 5s is the default, 8s is the undo case, since
 * an action the user has to notice and reach for needs longer than a notice
 * they only have to read.
 */
export const TOAST_DISMISS_MS = 5000;
export const TOAST_UNDO_DISMISS_MS = 8000;

// §8: bottom-center, z 500 (§4). The 24px stand-off from the viewport edge is
// §4's page gutter.
export const TOAST_VIEWPORT_CLASSES =
  "pointer-events-none fixed inset-x-0 bottom-[24px] z-[var(--z-toast)] flex flex-col " +
  "items-center gap-[8px] px-[24px]";

// §8: glass recipe, radius 12, ui-body. §5 puts a toast on the dropdown shadow.
// The 400 max width is §8's confirm-modal measure — the spec's only figure for
// a narrow overlay — and 20px padding is the ticket-confirmed overlay padding.
const TOAST_BASE =
  "glass pointer-events-auto flex w-full max-w-[400px] items-center gap-[8px] " +
  "rounded-[12px] p-[20px] type-ui-body text-n-primary " +
  "[--glass-elevation:var(--shadow-dropdown)]";

export function toastClasses(className?: string): string {
  return cx(TOAST_BASE, className);
}

const TOAST_DOT_TONE_CLASSES: Record<ToastTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
};

/** 8px is the system dot, confirmed on the ticket; §8 gives only the colour. */
export function toastDotClasses(tone: ToastTone = "success", className?: string): string {
  return cx("size-[8px] shrink-0 rounded-pill", TOAST_DOT_TONE_CLASSES[tone], className);
}

/**
 * §8: optional undo action in --prime. The action reuses the T0.2 ghost button
 * for its sizing and press physics, and ghost paints its label --n-secondary,
 * so the colour is forced rather than left to stylesheet order.
 */
export const TOAST_ACTION_CLASSES = "ml-auto text-prime! hover:not-disabled:text-prime!";

/* -------------------------------------------------------------------------- */
/* Modal & sheet — §8 "Modals & sheets"                                       */
/* -------------------------------------------------------------------------- */

/** §8: max 400 (confirm) / 640 (content). */
export type ModalWidth = "confirm" | "content";

export const MODAL_WIDTHS: readonly ModalWidth[] = ["confirm", "content"];

// §8 scrim --bg-scrim; §4 puts scrim and modal together on rung 400.
export const SCRIM_CLASSES = "fixed inset-0 z-[var(--z-modal)] bg-bg-scrim";

/** The centring frame. 24px is §4's gutter. */
export const MODAL_VIEWPORT_CLASSES =
  "pointer-events-none fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-[24px]";

// §8: glass recipe, --r-md, modal shadow. Padding 20 and the 8px footer gap are
// the ticket-confirmed overlay spacing; the max height is the viewport less
// §4's gutter top and bottom.
const MODAL_BASE =
  "glass pointer-events-auto relative flex max-h-[calc(100vh_-_48px)] w-full flex-col " +
  "rounded-md p-[20px] [--glass-elevation:var(--shadow-modal)]";

const MODAL_WIDTH_CLASSES: Record<ModalWidth, string> = {
  confirm: "max-w-[400px]",
  content: "max-w-[640px]",
};

export function modalClasses(width: ModalWidth = "confirm", className?: string): string {
  return cx(MODAL_BASE, MODAL_WIDTH_CLASSES[width], className);
}

// §8 side sheets: 480 wide, right slide-in --t-med, glass recipe, --r-lg on the
// leading corners only. §5 lists a shadow for modals and dropdowns but not for
// sheets; a sheet is a modal-class layer, so it takes the modal shadow.
export const SHEET_VIEWPORT_CLASSES =
  "pointer-events-none fixed inset-0 z-[var(--z-modal)] flex justify-end";

const SHEET_BASE =
  "glass sheet-in pointer-events-auto relative flex h-full w-full max-w-[480px] flex-col " +
  "rounded-l-lg p-[20px] [--glass-elevation:var(--shadow-modal)]";

export function sheetClasses(className?: string): string {
  return cx(SHEET_BASE, className);
}

/** §8: title display-lg. */
export const MODAL_TITLE_CLASSES = "type-display-lg text-n-primary";

/** §8: footer buttons right, primary last. Sticky so a scrolling body keeps it. */
export const MODAL_FOOTER_CLASSES =
  "sticky bottom-0 mt-[16px] flex shrink-0 items-center justify-end gap-[8px]";

export const MODAL_BODY_CLASSES = "scroll-thin min-h-0 flex-1 overflow-y-auto type-ui-body";

/* -------------------------------------------------------------------------- */
/* Avatar — §8 "Avatars"                                                      */
/* -------------------------------------------------------------------------- */

/** §8: circular, sizes 24 · 32 · 40 · 44 · 48 · 56 · 64 · 80 · 96 · 112. */
export type AvatarSize = 24 | 32 | 40 | 44 | 48 | 56 | 64 | 80 | 96 | 112;

export const AVATAR_SIZES: readonly AvatarSize[] = [24, 32, 40, 44, 48, 56, 64, 80, 96, 112];

/** §8: --success present, --warning away — the same dot language as freshness. */
export type AvatarStatus = "present" | "away";

export const AVATAR_STATUSES: readonly AvatarStatus[] = ["present", "away"];

const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
  24: "size-[24px]",
  32: "size-[32px]",
  40: "size-[40px]",
  44: "size-[44px]",
  48: "size-[48px]",
  56: "size-[56px]",
  64: "size-[64px]",
  80: "size-[80px]",
  96: "size-[96px]",
  112: "size-[112px]",
};

export function avatarClasses(size: AvatarSize = 32, className?: string): string {
  // Fallback fill is §2's nested-fill surface with secondary text; §8 names the
  // shape and the sizes but not the empty state.
  return cx(
    "flex items-center justify-center overflow-hidden rounded-pill bg-surface-2 text-n-secondary",
    AVATAR_SIZE_CLASSES[size],
    className,
  );
}

/** Initials come off the §3 scale rather than being scaled freehand. */
export function avatarInitialsClasses(size: AvatarSize = 32): string {
  return size < 48 ? "type-ui-caption" : "type-display-md";
}

const AVATAR_STATUS_TONE_CLASSES: Record<AvatarStatus, string> = {
  present: "bg-success",
  away: "bg-warning",
};

/**
 * §8: status dot bottom-right. 8px is the ticket-confirmed system dot; the 1px
 * ring in --bg-base separates it from the portrait and stays inside §4's
 * "1px everywhere, 2px reserved for meaning".
 */
export function avatarStatusClasses(status: AvatarStatus = "present", className?: string): string {
  return cx(
    "absolute right-0 bottom-0 size-[8px] rounded-pill outline outline-1 outline-bg-base",
    AVATAR_STATUS_TONE_CLASSES[status],
    className,
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state — §8 "Empty states"                                            */
/* -------------------------------------------------------------------------- */

// §8: icon 24 --n-secondary + one ui-body line + one action; dot-grid texture
// allowed here (§0 law 9 bans it behind working content). Padding 20 and the
// 16px stack gap are the ticket-confirmed overlay spacing and 8-grid.
const EMPTY_STATE_BASE =
  "flex flex-col items-center justify-center gap-[16px] rounded-sm p-[20px] text-center";

export function emptyStateClasses(textured = false, className?: string): string {
  return cx(EMPTY_STATE_BASE, textured && "dot-grid", className);
}

/** §8: icon 24, --n-secondary. */
export const EMPTY_STATE_ICON_SIZE = 24;
export const EMPTY_STATE_ICON_CLASSES =
  "inline-flex size-[24px] items-center justify-center text-n-secondary [&_svg]:size-full";
export const EMPTY_STATE_TEXT_CLASSES = "type-ui-body text-n-secondary";

/* -------------------------------------------------------------------------- */
/* Skeleton — §6 shimmer                                                      */
/* -------------------------------------------------------------------------- */

/**
 * §6 fixes the shimmer itself (surface-2 base, rgba(255,255,255,.04) highlight,
 * 1.2s linear loop, and in v2.1 the sweep geometry: a 200%-wide gradient
 * traversing left to right, one pass per loop). All of that lives in `.shimmer`
 * in globals.css; the shape only picks a radius from §5.
 */
export type SkeletonShape = "block" | "text" | "circle";

export const SKELETON_SHAPES: readonly SkeletonShape[] = ["block", "text", "circle"];

const SKELETON_SHAPE_CLASSES: Record<SkeletonShape, string> = {
  // Mirrors a card (§5: cards are --r-sm).
  block: "rounded-sm",
  // A line of text mirrors the pill grammar the rest of the system uses.
  text: "rounded-pill",
  circle: "aspect-square rounded-pill",
};

export function skeletonClasses(shape: SkeletonShape = "block", className?: string): string {
  return cx("shimmer block", SKELETON_SHAPE_CLASSES[shape], className);
}

/* -------------------------------------------------------------------------- */
/* OTP — §8 "Inputs" (OTP)                                                    */
/* -------------------------------------------------------------------------- */

/** §12: six-digit codes. */
export const OTP_BOX_COUNT = 6;

// §8: "OTP: 6 boxes 52×52, radius 27, gap 16, special-otp centered; filled box
// border --prime." Radius 27 is the resolved value, not the proportional rule:
// a 52h pill clamps to half its height at 26, and the spec wrote 27 — one past
// the clamp, so the box is unambiguously a pill however it is measured.
//
// v2.4 steps the group down below 768: 44×44, radius 22, gap 8. Six 52s with
// five 16 gaps need 392px, which does not fit a 375 viewport — the boxes ran off
// the screen. 6×44 + 5×8 = 304 does. `md` is Tailwind's 768, which is exactly
// §4's breakpoint, so the step happens where the spec puts it. The OTP stays
// exempt from the 48 field height in both directions; this is its own scale.
// §8 (v2.5): steps left-align, and the OTP group is the one exception —
// six discrete boxes are a display, not a text field, so the group stays
// centred in the content width.
export const OTP_GROUP_CLASSES = "flex justify-center gap-[8px] md:gap-[16px]";

const OTP_BOX_BASE =
  "otp-box size-[44px] rounded-[22px] md:size-[52px] md:rounded-[27px] " +
  "border bg-surface-1 text-center type-special-otp " +
  "text-n-primary caret-prime transition-[border-color,box-shadow] " +
  "duration-[var(--t-fast)] ease-brand focus:outline-none " +
  "disabled:cursor-default disabled:opacity-40";

export type OtpBoxClassOptions = {
  /** §8: a filled box takes a --prime border. */
  filled?: boolean | undefined;
  /** §8 inputs: error swaps the border to --danger. */
  invalid?: boolean | undefined;
  className?: string | undefined;
};

export function otpBoxClasses({
  filled = false,
  invalid = false,
  className,
}: OtpBoxClassOptions = {}): string {
  return cx(
    OTP_BOX_BASE,
    invalid ? "border-danger" : filled ? "border-prime" : "border-glass-border",
    // §8 (v2.5) focus split: the border swaps on any focus. The ring and the
    // glow are the keyboard path's, and live in globals.css with the field's.
    !invalid && "focus:border-prime",
    className,
  );
}
