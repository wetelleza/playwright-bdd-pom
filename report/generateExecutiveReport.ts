import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseResults } from './parseResults';
import { computeSummary } from './computeSummary';
import { renderExecutiveReport } from './renderExecutiveReport';

function main() {
  const repoRoot = process.cwd();
  const jsonPath = join(repoRoot, 'test-results', 'results.json');

  if (!existsSync(jsonPath)) {
    throw new Error(`Could not find ${jsonPath}. Run the tests first (e.g. "npm test" or "npm run test:saucedemo").`);
  }

  const { results, totalDurationMs } = parseResults(jsonPath);
  const summary = computeSummary(results, totalDurationMs);
  const html = renderExecutiveReport(summary);

  const outDir = join(repoRoot, 'executive-report');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'index.html');
  writeFileSync(outPath, html, 'utf-8');

  console.log(`Executive report generated: ${outPath}`);
  console.log(`Pass rate: ${summary.passRate.toFixed(1)}% (${summary.passed + summary.flaky}/${summary.total})`);
}

main();
