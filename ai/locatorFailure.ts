export interface LocatorFailure {
  brokenLocatorText: string;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Playwright's own timeout error echoes the locator's code form back verbatim, e.g.:
//   "waiting for locator('#user-name')"
//   "waiting for getByRole('button', { name: 'Login' })"
// Matched greedily to end-of-line since a locator call itself can contain nested parens
// (getByRole's options object) — this is intentionally permissive, `ai/grounding.ts`'s
// groundGeneratedCode is the real gate that rejects anything not literally in the DOM digest.
const LOCATOR_WAIT_PATTERN = /waiting for ((?:locator|getBy\w+)\([\s\S]+?\))\s*$/m;

/**
 * The Planner's classification step: is this failure even a locator problem? Anything that
 * doesn't match Playwright's own element-not-found/timeout error shape — a content assertion,
 * a network error, an application bug — returns null so the healer leaves it untouched instead
 * of "fixing" a real regression by masking it as a selector rename.
 *
 * Strips ANSI color codes first — confirmed necessary against a real Playwright JSON reporter
 * failure: the "waiting for locator(...)" line is wrapped in `\x1b[2m...\x1b[22m` (dim styling),
 * which otherwise sits between the closing `)` and end-of-line and breaks the match.
 */
export function classifyFailure(errorMessage: string): LocatorFailure | null {
  const clean = errorMessage.replace(ANSI_PATTERN, '');
  const match = clean.match(LOCATOR_WAIT_PATTERN);
  if (!match) return null;
  return { brokenLocatorText: match[1].trim() };
}
