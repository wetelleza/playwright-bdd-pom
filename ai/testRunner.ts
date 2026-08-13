import { spawnSync } from 'node:child_process';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// spawnSync('npx.cmd', [...]) without shell throws EINVAL on Windows (a known Node bug when
// spawning .cmd files directly). shell:true with an args array doesn't work either: Node only
// concatenates, it doesn't quote, so "Sort products from highest to lowest price" would get
// split into loose arguments and --grep ended up matching any scenario with "Sort" in it. The
// fix that works on both systems: a single command string with shell:true, quoting the --grep
// value by hand.
function shQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Runs one scenario by title, chromium only — shared by implementMissingSteps.ts (probe/retry
 * loop) and healLocators.ts (probe + verify loop). No need to pay for 3 browsers per attempt:
 * full cross-browser validation is `npm test`'s job, not these AI-driven retry loops'.
 */
export function runPlaywright(repoRoot: string, grepTitle: string): { exitCode: number; output: string } {
  const bddgen = spawnSync('npx bddgen', [], { cwd: repoRoot, encoding: 'utf-8', shell: true });
  const testCmd = `npx playwright test --grep ${shQuote(escapeRegExp(grepTitle))} --project=chromium --reporter=line`;
  const test = spawnSync(testCmd, [], { cwd: repoRoot, encoding: 'utf-8', shell: true });
  // Not truncated: probe-marker detection searches the whole output. Whoever sends it into a
  // prompt truncates only there, to avoid risking cutting off the marker.
  const errorText = [bddgen.error?.message, test.error?.message].filter(Boolean).join('\n');
  const output = `${bddgen.stdout ?? ''}${bddgen.stderr ?? ''}${test.stdout ?? ''}${test.stderr ?? ''}${errorText}`;
  return { exitCode: test.error ? 1 : (test.status ?? 1), output };
}
