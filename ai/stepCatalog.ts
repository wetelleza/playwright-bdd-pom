import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StepDefinition, StepKeyword, Suite } from './types';

const STEP_CALL_PATTERN = /\b(Given|When|Then)\s*\(\s*'((?:[^'\\]|\\.)*)'/g;

/**
 * Se recalcula en memoria en cada corrida (sin cachear a disco): a este tamaño de
 * catálogo (~decenas de steps) es instantáneo y evita que quede desactualizado.
 * Cuando el catálogo crezca mucho, este es el punto a reemplazar por un índice
 * precomputado (ej. embeddings) en vez de reparsear los .steps.ts en cada llamada.
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
