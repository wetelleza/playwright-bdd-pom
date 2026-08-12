import { readFileSync } from 'node:fs';
import type { FlatResult, TestStatus } from './types';

// Minimal typing for Playwright's JSON reporter (only what we use) — the real tree has
// more fields, but we don't depend on them.
interface PwResult {
  status?: string;
  duration?: number;
  error?: { message?: string };
}
interface PwTest {
  projectName?: string;
  status?: string; // 'expected' | 'unexpected' | 'flaky' | 'skipped'
  results?: PwResult[];
}
interface PwSpec {
  title?: string;
  tags?: string[]; // e.g. ["saucedemo", "smoke"] — no "@", that's how the JSON reporter stores them
  tests?: PwTest[];
}
interface PwSuite {
  title?: string;
  file?: string;
  suites?: PwSuite[];
  specs?: PwSpec[];
}
interface PwReport {
  suites?: PwSuite[];
  stats?: { duration?: number };
}

const OUTCOME_TO_STATUS: Record<string, TestStatus> = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
};

function detectSuite(tags: string[]): FlatResult['suite'] {
  if (tags.includes('demoqa')) return 'demoqa';
  if (tags.includes('saucedemo')) return 'saucedemo';
  if (tags.includes('api')) return 'api';
  return 'other';
}

function cleanErrorMessage(message: string | undefined): string | null {
  if (!message) return null;
  // eslint-disable-next-line no-control-regex
  const withoutAnsi = message.replace(/\x1b\[[0-9;]*m/g, '');
  const firstLine = withoutAnsi.split('\n').find((l) => l.trim().length > 0) ?? '';
  return firstLine.trim().slice(0, 200) || null;
}

function walkSuite(suite: PwSuite, file: string, out: FlatResult[]): void {
  const currentFile = suite.file ?? file;

  for (const spec of suite.specs ?? []) {
    const title = spec.title ?? '(untitled)';
    const suiteTag = detectSuite(spec.tags ?? []);

    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      const status = OUTCOME_TO_STATUS[test.status ?? ''] ?? 'skipped';
      const durationMs = results.reduce((sum, r) => sum + (r.duration ?? 0), 0);
      // For "flaky", the error is on the attempt that failed, not the last one (which passed) —
      // find the first result with an error, whatever its position.
      const firstErroredResult = results.find((r) => r.error?.message);

      out.push({
        title,
        file: currentFile,
        project: test.projectName ?? '(unknown)',
        suite: suiteTag,
        status,
        durationMs,
        errorMessage: status === 'failed' || status === 'flaky' ? cleanErrorMessage(firstErroredResult?.error?.message) : null,
      });
    }
  }

  for (const child of suite.suites ?? []) {
    walkSuite(child, currentFile, out);
  }
}

export function parseResults(jsonPath: string): { results: FlatResult[]; totalDurationMs: number } {
  const raw = readFileSync(jsonPath, 'utf-8');
  const report = JSON.parse(raw) as PwReport;

  const results: FlatResult[] = [];
  for (const suite of report.suites ?? []) {
    walkSuite(suite, suite.file ?? '', results);
  }

  return { results, totalDurationMs: report.stats?.duration ?? 0 };
}
