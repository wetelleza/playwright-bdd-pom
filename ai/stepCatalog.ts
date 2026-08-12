import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StepDefinition, StepKeyword, Suite } from './types';

const STEP_CALL_PATTERN = /\b(Given|When|Then)\s*\(\s*'((?:[^'\\]|\\.)*)'/g;

/**
 * Recomputed in memory on every run (no disk cache): at this catalog size (a few dozen
 * steps) it's instant and avoids the catalog going stale. When the catalog grows a lot,
 * this is the point to replace with a precomputed index (e.g. embeddings) instead of
 * re-parsing the .steps.ts files on every call.
 */
export function extractStepCatalog(suite: Suite, repoRoot: string = process.cwd()): StepDefinition[] {
  const stepsDir = join(repoRoot, 'steps', suite);
  const files = readdirSync(stepsDir).filter((f) => f.endsWith('.steps.ts'));

  const catalog: StepDefinition[] = [];
  for (const file of files) {
    const fullPath = join(stepsDir, file);
    const content = readFileSync(fullPath, 'utf-8');
    const sourceFile = relative(repoRoot, fullPath).replace(/\\/g, '/');

    for (const match of content.matchAll(STEP_CALL_PATTERN)) {
      const [, keyword, pattern] = match;
      catalog.push({ keyword: keyword as StepKeyword, pattern, sourceFile });
    }
  }

  return catalog;
}
