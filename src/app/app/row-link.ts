/**
 * The attributes that mark a list row's stops for the arrow keys — design-spec §11's grid.
 *
 * A plain module rather than an export of `RowWalker`: the row is a Server
 * Component and the walker is a client island, and a value imported across that
 * boundary arrives as a client reference rather than the string. Both sides
 * read this file instead.
 */

/** The row's name, the link to the item: the row's one Tab stop, and where Up and Down land. */
export const ROW_LINK_ATTRIBUTE = "data-row-link";

/**
 * The row's other controls — the gap chip, on an idle row the Park control, the overflow
 * trigger — which Right and Left walk in DOM order, the one-line row's visual order at
 * both heights. Each carries `tabindex="-1"`: reachable by arrow, never by Tab.
 */
export const ROW_CONTROL_ATTRIBUTE = "data-row-control";
