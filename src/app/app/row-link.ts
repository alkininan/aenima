/**
 * The attribute that marks a list row's link as a stop for the arrow keys.
 *
 * A plain module rather than an export of `RowWalker`: the row is a Server
 * Component and the walker is a client island, and a value imported across that
 * boundary arrives as a client reference rather than the string. Both sides
 * read this file instead.
 */
export const ROW_LINK_ATTRIBUTE = "data-row-link";
