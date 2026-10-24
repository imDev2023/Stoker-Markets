/**
 * The cookie that holds a visitor's light-or-dark choice (components/SchemeToggle.tsx sets it, the root layout reads it
 * onto <html> as `data-scheme`). A plain module, not the toggle's: a server component importing from a client module
 * gets a client reference in place of the string.
 */
export const SCHEME_COOKIE = "scheme";
