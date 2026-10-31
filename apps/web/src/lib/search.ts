/**
 * The site's one search is the board's (owner, 2026-10-31, after the header's own search was dropped): "/" and ⌘K reach
 * it from anywhere (SearchShortcut), and the hero's field sends its query to the board (LandingSearch).
 */

/** The attribute the board's search field carries, so the shortcut finds it on the page it is on. */
export const SITE_SEARCH_ATTRIBUTE = "data-site-search";
/** The hash the shortcut opens the board with from another page; the board answers it by focusing the field, then drops it. */
export const SEARCH_HASH = "#search";
