import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PageObjectDefinition, Suite } from './types';

const CLASS_PATTERN = /export class (\w+) extends BasePage/;
const METHOD_PATTERN = /(?:public\s+)?async\s+(\w+)\s*\(/g;

function fixtureNameFor(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1);
}

/**
 * Mismo patrón que stepCatalog.ts, aplicado a Page Objects: se usa para que el LLM elija en qué
 * página real va un método nuevo, y para que vea qué métodos ya existen y no proponga uno duplicado.
 */
export function extractPageObjectCatalog(suite: Suite, repoRoot: string = process.cwd()): PageObjectDefinition[] {
  const dir = join(repoRoot, 'pages', suite);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  const catalog: PageObjectDefinition[] = [];
  for (const file of files) {
    const fullPath = join(dir, file);
    const content = readFileSync(fullPath, 'utf-8');

    const classMatch = content.match(CLASS_PATTERN);
    if (!classMatch) continue;
    const className = classMatch[1];

    const methods = [...content.matchAll(METHOD_PATTERN)].map((m) => m[1]);

    catalog.push({
      className,
      fixtureName: fixtureNameFor(className),
      filePath: relative(repoRoot, fullPath).replace(/\\/g, '/'),
      methods,
    });
  }

  return catalog;
}
