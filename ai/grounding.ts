import { CucumberExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
import type { DomElementSummary, StepDefinition } from './types';

const STEP_LINE_PATTERN = /^(\s*)(Given|When|Then|And|But)\s+(.+?)\s*$/;

interface CompiledStep {
  definition: StepDefinition;
  expression: CucumberExpression;
}

function compileCatalog(catalog: StepDefinition[]): CompiledStep[] {
  const registry = new ParameterTypeRegistry();
  return catalog.map((definition) => ({
    definition,
    expression: new CucumberExpression(definition.pattern, registry),
  }));
}

function isStepText(text: string, compiled: CompiledStep[]): boolean {
  return compiled.some(({ expression }) => expression.match(text) !== null);
}

export function matchesPattern(pattern: string, stepText: string): boolean {
  const registry = new ParameterTypeRegistry();
  const expression = new CucumberExpression(pattern, registry);
  return expression.match(stepText) !== null;
}

export const TODO_MARKER_PREFIX = '# TODO_AI_MISSING: ';

/**
 * Anti-hallucination barrier: it's not enough to ask the LLM to reuse existing steps,
 * it has to be verified. Any Given/When/Then/And/But line that doesn't match a real step
 * from the catalog gets replaced in place with a `# TODO_AI_MISSING: <line>` comment
 * (valid Gherkin, bddgen ignores it) instead of being deleted — that way the implementation
 * phase (--implement-missing) knows exactly where to reinsert the real step if it manages
 * to write one.
 */
export function groundScenario(
  featureText: string,
  catalog: StepDefinition[],
): { groundedText: string; missingSteps: string[] } {
  const compiled = compileCatalog(catalog);
  const missingSteps: string[] = [];

  const groundedLines = featureText.split('\n').map((line) => {
    const match = line.match(STEP_LINE_PATTERN);
    if (!match) return line; // not a step line (Feature/Scenario/tags/table/etc.)

    const [, indent, , stepText] = match;
    if (isStepText(stepText, compiled)) return line;

    missingSteps.push(line.trim());
    return `${indent}${TODO_MARKER_PREFIX}${line.trim()}`;
  });

  return { groundedText: groundedLines.join('\n'), missingSteps };
}

/**
 * Collects the `# TODO_AI_MISSING: ...` lines of a feature, wherever they came from: the
 * ones the LLM itself wrote on purpose in the right spot (following the prompt) and the
 * ones groundScenario added as a safety net. This is the only channel --implement-missing
 * needs to look at.
 */
export function extractTodoLines(featureText: string): string[] {
  const pattern = new RegExp(`^\\s*${escapeRegExp(TODO_MARKER_PREFIX)}(.+)$`, 'gm');
  return [...featureText.matchAll(pattern)].map((m) => m[1].trim());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LOCATOR_CALL_PATTERN = /(?:this\.)?page\.\w+\([^()]*\)/g;

/**
 * Same idea as groundScenario, applied to selectors: the code generated for a Page Object
 * can only use page.getBy…/page.locator(…) calls that appear literally among the
 * `suggestedLocator` values from the real DOM digest (ai/domProbe.ts). If the LLM invents
 * one, it's rejected before writing anything and without spending a browser run.
 */
export function groundGeneratedCode(code: string, digest: DomElementSummary[]): { ok: boolean; invalidCalls: string[] } {
  const allowed = new Set(digest.map((d) => d.suggestedLocator));
  const calls = [...code.matchAll(LOCATOR_CALL_PATTERN)].map((m) => m[0].replace(/^this\./, ''));
  const invalidCalls = [...new Set(calls.filter((call) => !allowed.has(call)))];
  return { ok: invalidCalls.length === 0, invalidCalls };
}
