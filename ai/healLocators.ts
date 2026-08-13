import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { DomElementSummary, Suite } from './types';
import { classifyFailure } from './locatorFailure';
import { findLocatorField } from './pageObjectCatalog';
import { insertProbeAtMethodStart, replaceConstructorAssignment } from './codeInsertion';
import { readProbe, PROBE_MARKER } from './probeRuntime';
import { groundGeneratedCode } from './grounding';
import { runPlaywright } from './testRunner';
import { askClaude, extractCode } from './implementMissingSteps';

const PROBE_IMPORT_LINE = "import { captureProbe } from '../../ai/probeRuntime';";

// Minimal typing for Playwright's JSON reporter, same shape report/parseResults.ts already
// knows — but that module's cleanErrorMessage truncates to the first 200-char line, built for a
// human-readable report. The Planner needs the FULL error text: confirmed against a real failure
// that the top-level `error.message` is just "Test timeout of 30000ms exceeded." — the actual
// "waiting for locator(...)" line only shows up in `errors[]` and `steps[].error`, so all three
// have to be collected and concatenated, not just `error.message` alone.
interface PwErrorMessage {
  message?: string;
}
interface PwStep {
  error?: { message?: string };
}
interface PwResult {
  status?: string;
  error?: { message?: string };
  errors?: PwErrorMessage[];
  steps?: PwStep[];
}
interface PwTest {
  projectName?: string;
  status?: string; // 'expected' | 'unexpected' | 'flaky' | 'skipped'
  results?: PwResult[];
}
interface PwSpec {
  title?: string;
  tags?: string[];
  tests?: PwTest[];
}
interface PwSuite {
  suites?: PwSuite[];
  specs?: PwSpec[];
}
interface PwReport {
  suites?: PwSuite[];
}

interface RawFailure {
  title: string;
  suite: Suite | 'api' | 'other';
  project: string;
  errorMessage: string;
}

type HealStatus = 'healed' | 'skipped-not-locator' | 'skipped-no-match' | 'skipped-verification-failed';

interface HealResult {
  status: HealStatus;
  detail?: string;
}

function detectSuite(tags: string[]): Suite | 'api' | 'other' {
  if (tags.includes('demoqa')) return 'demoqa';
  if (tags.includes('saucedemo')) return 'saucedemo';
  if (tags.includes('api')) return 'api';
  return 'other';
}

function walkSuite(suite: PwSuite, out: RawFailure[]): void {
  for (const spec of suite.specs ?? []) {
    const suiteTag = detectSuite(spec.tags ?? []);
    for (const test of spec.tests ?? []) {
      // 'unexpected' = genuinely failed after retries. 'flaky' resolved itself on a later
      // attempt and shouldn't trigger healing; 'skipped' never ran.
      if (test.status !== 'unexpected') continue;
      const results = test.results ?? [];
      const firstErrored = results.find(
        (r) => r.error?.message || (r.errors?.length ?? 0) > 0 || (r.steps ?? []).some((s) => s.error?.message),
      );
      if (!firstErrored) continue;

      const errorMessage = [
        firstErrored.error?.message,
        ...(firstErrored.errors ?? []).map((e) => e.message),
        ...(firstErrored.steps ?? []).map((s) => s.error?.message),
      ]
        .filter((m): m is string => Boolean(m))
        .join('\n');
      if (!errorMessage) continue;

      out.push({
        title: spec.title ?? '(untitled)',
        suite: suiteTag,
        project: test.projectName ?? '(unknown)',
        errorMessage,
      });
    }
  }
  for (const child of suite.suites ?? []) walkSuite(child, out);
}

function readFailures(resultsPath: string): RawFailure[] {
  const report = JSON.parse(readFileSync(resultsPath, 'utf-8')) as PwReport;
  const out: RawFailure[] = [];
  for (const suite of report.suites ?? []) walkSuite(suite, out);
  return out;
}

/**
 * Which method in the class actually uses this locator field — the probe needs somewhere to
 * run from. Picks the first method (source order) whose body references `this.<fieldName>`;
 * good enough since this only decides where to capture a DOM digest, not what to change.
 */
function findMethodUsingField(filePath: string, className: string, fieldName: string): string | null {
  const content = readFileSync(filePath, 'utf-8');
  const classMatch = content.match(new RegExp(`export class ${className}\\b[^{]*{`));
  if (!classMatch || classMatch.index === undefined) return null;

  const classBody = content.slice(classMatch.index + classMatch[0].length);
  const methodStarts = [...classBody.matchAll(/(?:public\s+)?async\s+(\w+)\s*\(/g)];

  for (let i = 0; i < methodStarts.length; i++) {
    const current = methodStarts[i];
    const next = methodStarts[i + 1];
    const bodyText = classBody.slice(current.index!, next?.index);
    if (bodyText.includes(`this.${fieldName}`)) return current[1];
  }
  return null;
}

function formatDigest(digest: DomElementSummary[]): string {
  return digest.map((d) => `- ${d.suggestedLocator}${d.accessibleName ? `  // "${d.accessibleName}"` : ''}`).join('\n');
}

/** Generator: asks Claude to pick ONE real replacement from the digest, or say the element is gone. */
async function proposeReplacement(
  anthropic: Anthropic,
  model: string,
  brokenLocatorText: string,
  digest: DomElementSummary[],
  errorMessage: string,
): Promise<string | null> {
  const system = `You're diagnosing a broken Playwright locator in an existing, previously-passing test. A selector that used to work no longer matches any element on the real page — it may have been renamed, or the element may genuinely be gone (a real product regression, not a rename).
Respond EXCLUSIVELY with a \`\`\`typescript block containing ONLY the replacement locator expression, copied LITERALLY from the list below — never invent one, never modify one.
If none of the real elements below plausibly correspond to the old locator's purpose, respond with a \`\`\`typescript block containing exactly NONE instead — that means this looks like a real regression, not a renamed selector, and a human should look at it.`;

  const user = `The old, now-broken locator: page.${brokenLocatorText}

Real elements on the page right now (pick one, or respond NONE):
${formatDigest(digest)}

Failure message from the test run:
${errorMessage.slice(0, 2000)}`;

  const text = await askClaude(anthropic, model, system, user);
  const code = extractCode(text);
  if (!code || code.trim() === 'NONE') return null;
  return code.trim();
}

/** Planner -> Generator (probe) -> Generator (fix) -> Healer (apply + verify), for one failure. */
async function attemptHeal(
  anthropic: Anthropic,
  model: string,
  suite: Suite,
  specTitle: string,
  errorMessage: string,
  repoRoot: string,
): Promise<HealResult> {
  const failure = classifyFailure(errorMessage);
  if (!failure) return { status: 'skipped-not-locator' };

  const field = findLocatorField(suite, failure.brokenLocatorText, repoRoot);
  if (!field) {
    return { status: 'skipped-not-locator', detail: `Could not map "${failure.brokenLocatorText}" to a known Page Object field` };
  }

  const pageFilePath = join(repoRoot, field.filePath);
  const originalContent = readFileSync(pageFilePath, 'utf-8');

  const methodName = findMethodUsingField(pageFilePath, field.className, field.fieldName);
  if (!methodName) {
    return { status: 'skipped-no-match', detail: `No method in ${field.className} references this.${field.fieldName}` };
  }

  try {
    const probeId = `heal-${field.fieldName}-${Date.now()}`;
    insertProbeAtMethodStart(pageFilePath, field.className, methodName, probeId, PROBE_IMPORT_LINE);
    const probeRun = runPlaywright(repoRoot, specTitle);

    if (!probeRun.output.includes(PROBE_MARKER)) {
      writeFileSync(pageFilePath, originalContent, 'utf-8');
      return { status: 'skipped-no-match', detail: 'The probe never ran (an earlier step in the flow fails first)' };
    }

    const digest = readProbe(probeId);
    // Restore before proposing the fix: the probe stub must never be what ends up in a PR.
    writeFileSync(pageFilePath, originalContent, 'utf-8');

    const replacement = await proposeReplacement(anthropic, model, failure.brokenLocatorText, digest, errorMessage);
    if (!replacement) {
      return { status: 'skipped-no-match', detail: 'No confident replacement found in the real DOM — possible regression, not a rename' };
    }

    const grounding = groundGeneratedCode(`this.${field.fieldName} = ${replacement};`, digest);
    if (!grounding.ok) {
      return { status: 'skipped-no-match', detail: `Proposed replacement isn't grounded in the real DOM: ${replacement}` };
    }

    replaceConstructorAssignment(pageFilePath, field.className, field.fieldName, `this.${field.fieldName} = ${replacement};`);
    const verifyRun = runPlaywright(repoRoot, specTitle);
    if (verifyRun.exitCode !== 0) {
      writeFileSync(pageFilePath, originalContent, 'utf-8');
      return { status: 'skipped-verification-failed', detail: 'Applied the fix but the scenario still fails — reverted' };
    }

    return { status: 'healed', detail: `${field.className}.${field.fieldName}: page.${failure.brokenLocatorText} -> ${replacement}` };
  } catch (err) {
    writeFileSync(pageFilePath, originalContent, 'utf-8');
    throw err;
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const resultsPath = join(repoRoot, 'test-results', 'results.json');
  if (!existsSync(resultsPath)) {
    console.log('No test-results/results.json found — nothing to heal.');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY not set — skipping self-healing.');
    return;
  }
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

  const failures = readFailures(resultsPath).filter(
    (f): f is RawFailure & { suite: Suite } =>
      f.project === 'chromium' && (f.suite === 'demoqa' || f.suite === 'saucedemo'),
  );

  if (failures.length === 0) {
    console.log('No chromium UI failures to consider for self-healing.');
    return;
  }

  console.log(`Found ${failures.length} chromium UI failure(s) to triage.\n`);

  let healedCount = 0;
  for (const failure of failures) {
    console.log(`--- ${failure.title} [${failure.suite}] ---`);
    const result = await attemptHeal(anthropic, model, failure.suite, failure.title, failure.errorMessage, repoRoot);
    console.log(`  ${result.status}${result.detail ? `: ${result.detail}` : ''}`);
    if (result.status === 'healed') healedCount++;
  }

  console.log(`\n${healedCount} locator(s) healed out of ${failures.length} failure(s) triaged.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
