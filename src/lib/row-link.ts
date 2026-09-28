/**
 * The attribute that marks a list row's link, carrying the row's key.
 *
 * Two readers: `RowWalker`, for which it marks the row's stop for the arrow keys (§11), and
 * `RouteFocus`, which records the key of the row that was opened and finds it again on the
 * way back (§11, "the way back restores the place"). A plain module rather than an export of
 * either: the row is a Server Component and the walker a client island, and a value imported
 * across that boundary arrives as a client reference rather than the string.
 */
export const ROW_LINK_ATTRIBUTE = "data-row-link";
