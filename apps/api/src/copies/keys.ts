/**
 * Copy Protection (#120): the keys a coin's name and ticker fold into, so a copy with other letters that look the same
 * still matches the original. Three keys, each coarser than the last, so a strict match implies a loose one and a loose
 * match a core one:
 *
 * - strict: Unicode normalised (NFKC), upper case, lookalike letters from other scripts mapped to Latin, letters and
 *   digits only ("$PEPE", "pepe" and "РЕРЕ" with Cyrillic letters all give "PEPE");
 * - loose: strict with leetspeak digits read as letters ("P3P3" gives "PEPE");
 * - core: loose with the words a copy adds to claim it is the real one taken off the ends ("OFFICIALPEPE2" gives "PEPE").
 *
 * The thresholds follow the measurements in Top-pad's copycat research (2026-10-26): near matches count only from five
 * characters, since most three-letter tickers are one edit from a real one.
 */

/** Letters from other scripts that look like a Latin capital, after NFKC and upper-casing. */
const LOOKALIKES: Record<string, string> = {
  // Cyrillic
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", Ѕ: "S", І: "I", Ј: "J", Ԁ: "D", Ғ: "F", Ԝ: "W", Ӏ: "I",
  // Greek
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
  // Others that survive NFKC
  Ø: "O", Ð: "D", Þ: "P", Æ: "AE", Œ: "OE", ẞ: "SS", "€": "E", "£": "L", "¥": "Y",
};

const LEET: Record<string, string> = { "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "7": "T", "8": "B" };

/** Words a copy adds to pass as the original, taken off either end of the loose key while at least four characters remain. */
const CLAIM_AFFIXES = ["OFFICIAL", "ORIGINAL", "REAL", "THE", "OG", "CTO", "ONSOL", "COIN", "TOKEN", "V2", "V3", "II", "2", "3"];

/** Words that make a derivative rather than a copy ("BABYPEPE"): a near match, not an equal one. */
const DERIVATIVE_AFFIXES = ["BABY", "MINI", "LIL", "KID", "SUPER", "MEGA", "GIGA", "SON", "DAUGHTER", "JR"];

/** The strict key: what is left of the text once its letters are made comparable. Empty for text without any. */
export function strictKey(text: string): string {
  let out = "";
  // Combining marks (accents) go with NFD before the lookalike map; NFKC first folds width and compatibility forms.
  for (const ch of text.normalize("NFKC").toUpperCase().normalize("NFD")) {
    const mapped = LOOKALIKES[ch] ?? ch;
    for (const c of mapped) if (/[A-Z0-9]/.test(c)) out += c;
  }
  return out;
}

export function looseKey(text: string): string {
  return strictKey(text).replace(/[0134578]/g, (d) => LEET[d]!);
}

export function coreKey(text: string): string {
  return stripAffixes(looseKey(text), CLAIM_AFFIXES, 4);
}

/** Takes the listed affixes off both ends, again and again, while `min` characters would remain. */
function stripAffixes(key: string, affixes: string[], min: number): string {
  let k = key;
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of affixes) {
      if (k.length - a.length < min) continue;
      if (k.startsWith(a)) { k = k.slice(a.length); changed = true; }
      else if (k.endsWith(a)) { k = k.slice(0, -a.length); changed = true; }
    }
  }
  return k;
}

export type CoinKeys = { strict: string; loose: string; core: string };

export const keysOf = (text: string): CoinKeys => ({ strict: strictKey(text), loose: looseKey(text), core: coreKey(text) });

/** The shortest key that still means something: a one or two character ticker matches nothing but itself exactly. */
export const MIN_CORE = 3;
/** Near matches (one edit, a derivative word) count only from this many characters. */
export const MIN_NEAR = 5;

/** Whether `candidate` is the same coin as `protectedKeys` under any of the three keys. */
export function sameAs(candidate: CoinKeys, protectedKeys: CoinKeys): boolean {
  if (candidate.strict && candidate.strict === protectedKeys.strict) return true;
  if (candidate.loose && candidate.loose === protectedKeys.loose) return true;
  if (candidate.core.length >= MIN_CORE && candidate.core === protectedKeys.core) return true;
  return false;
}

/** Whether `candidate` is one edit or one derivative word away from `protectedKeys`, both being long enough to tell. */
export function nearTo(candidate: CoinKeys, protectedKeys: CoinKeys): boolean {
  const a = candidate.loose;
  const b = protectedKeys.loose;
  if (a.length >= MIN_NEAR && b.length >= MIN_NEAR && Math.abs(a.length - b.length) <= 1 && editDistance(a, b) === 1) return true;
  if (b.length >= 4 && stripAffixes(a, DERIVATIVE_AFFIXES, 4) === b && a !== b) return true;
  return false;
}

/** Levenshtein distance, cut off at 2 since only 0 and 1 matter here. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (cur[j]! < best) best = cur[j]!;
    }
    if (best > 1) return 2;
    prev = cur;
  }
  return prev[b.length]! > 1 ? 2 : prev[b.length]!;
}
