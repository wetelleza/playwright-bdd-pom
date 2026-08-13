import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PageObjectDefinition, Suite } from './types';

const CLASS_PATTERN = /export class (\w+) extends BasePage/;
const METHOD_PATTERN = /(?:public\s+)?async\s+(\w+)\s*\(/g;

function fixtureNameFor(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1);
}

/**
 * Same pattern as stepCatalog.ts, applied to Page Objects: used so the LLM can pick which
 * real page a new method belongs to, and see which methods already exist so it doesn't
 * propose a duplicate.
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

/**
 * Locates which Page Object field a broken locator belongs to, for the self-healing feature.
 * Real Page Objects in this repo assign locators once as constructor fields (e.g.
 * `this.username = page.locator('#user-name');`), never inline in a method — so unlike
 * extractPageObjectCatalog (method names only), this needs to read constructor assignment
 * lines directly rather than reuse the method-name regex above.
 */
export function findLocatorField(
  suite: Suite,
  locatorCallText: string,
  repoRoot: string = process.cwd(),
): { filePath: string; className: string; fieldName: string } | null {
  const dir = join(repoRoot, 'pages', suite);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  for (const file of files) {
    const fullPath = join(dir, file);
    const content = readFileSync(fullPath, 'utf-8');
    const classMatch = content.match(CLASS_PATTERN);
    if (!classMatch) continue;

    for (const line of content.split('\n')) {
      const assignmentMatch = line.match(/^\s*this\.(\w+)\s*=\s*(.+);\s*$/);
      if (assignmentMatch && assignmentMatch[2].includes(locatorCallText)) {
        return {
          filePath: relative(repoRoot, fullPath).replace(/\\/g, '/'),
          className: classMatch[1],
          fieldName: assignmentMatch[1],
        };
      }
    }
  }

  return null;
}
