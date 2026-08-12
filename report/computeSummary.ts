import type { ExecutiveSummary, FlatResult, GroupStat } from './types';

// A "flaky" test failed and then passed on a retry: it ultimately works, so for the pass
// rate (the "does it work?" question) it counts as passed. It's still shown separately in
// the composition and the count, because instability is a real signal worth watching.
function countsAsPassed(status: FlatResult['status']): boolean {
  return status === 'passed' || status === 'flaky';
}

function groupBy(results: FlatResult[], key: (r: FlatResult) => string): GroupStat[] {
  const groups = new Map<string, FlatResult[]>();
  for (const r of results) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  return [...groups.entries()]
    .map(([label, items]) => {
      const passed = items.filter((i) => countsAsPassed(i.status)).length;
      return { label, total: items.length, passed, passRate: items.length ? (passed / items.length) * 100 : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeSummary(results: FlatResult[], totalDurationMs: number): ExecutiveSummary {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const flaky = results.filter((r) => r.status === 'flaky').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const total = results.length;

  return {
    generatedAt: new Date().toISOString(),
    total,
    passed,
    failed,
    flaky,
    skipped,
    passRate: total ? ((passed + flaky) / total) * 100 : 0,
    durationMs: totalDurationMs,
    bySuite: groupBy(
      results.filter((r) => r.suite !== 'other'),
      (r) => r.suite,
    ),
    byBrowser: groupBy(results, (r) => r.project),
    failures: results.filter((r) => r.status === 'failed' || r.status === 'flaky'),
  };
}
