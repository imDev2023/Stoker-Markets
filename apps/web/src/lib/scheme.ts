/**
 * The site's light-or-dark scheme: dark by default (owner, 2026-11-05: "Default the website to dark mode"; it followed
 * the visitor's system setting before), light once the account menu's toggle chose it. The choice is a cookie
 * (components/SchemeToggle.tsx sets it) the root layout reads onto <html> as `data-scheme` on every page, so a page
 * never paints the other scheme first and the stylesheet reads no media query. A plain module, not the toggle's: a
 * server component importing from a client module gets a client reference in place of the string.
 */
export const SCHEME_COOKIE = "scheme";

export type Scheme = "light" | "dark";

/** The scheme a cookie's value stands for: light only when it says so, dark otherwise. */
export const schemeOf = (cookie: string | undefined): Scheme => (cookie === "light" ? "light" : "dark");
