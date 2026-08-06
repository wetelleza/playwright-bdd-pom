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
 * Barrera anti-alucinación: no basta con pedirle al LLM que reutilice steps existentes,
 * hay que verificarlo. Cualquier línea Given/When/Then/And/But que no matchee ningún step
 * real del catálogo se reemplaza en el lugar por un comentario `# TODO_AI_MISSING: <línea>`
 * (Gherkin válido, bddgen lo ignora) en vez de borrarla — así la fase de implementación
 * (--implement-missing) sabe exactamente dónde reinsertar el step real si logra escribirlo.
 */
export function groundScenario(
  featureText: string,
  catalog: StepDefinition[],
): { groundedText: string; missingSteps: string[] } {
  const compiled = compileCatalog(catalog);
  const missingSteps: string[] = [];

  const groundedLines = featureText.split('\n').map((line) => {
    const match = line.match(STEP_LINE_PATTERN);
    if (!match) return line; // no es una línea de step (Feature/Scenario/tags/tabla/etc.)

    const [, indent, , stepText] = match;
    if (isStepText(stepText, compiled)) return line;

    missingSteps.push(line.trim());
    return `${indent}${TODO_MARKER_PREFIX}${line.trim()}`;
  });

  return { groundedText: groundedLines.join('\n'), missingSteps };
}

/**
 * Junta los `# TODO_AI_MISSING: ...` de un feature, vengan de donde vengan: los que el propio
 * LLM escribió a propósito en el lugar correcto (siguiendo el prompt) y los que groundScenario
 * agregó como red de seguridad. Es el único canal que --implement-missing necesita mirar.
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
 * Misma idea que groundScenario, aplicada a selectores: el código generado para un Page Object
 * solo puede usar llamadas page.getBy…/page.locator(…) que aparezcan literalmente entre los
 * `suggestedLocator` del digest real del DOM (ai/domProbe.ts). Si el LLM inventa una, se rechaza
 * antes de escribir nada y sin gastar una corrida de browser.
 */
export function groundGeneratedCode(code: string, digest: DomElementSummary[]): { ok: boolean; invalidCalls: string[] } {
  const allowed = new Set(digest.map((d) => d.suggestedLocator));
  const calls = [...code.matchAll(LOCATOR_CALL_PATTERN)].map((m) => m[0].replace(/^this\./, ''));
  const invalidCalls = [...new Set(calls.filter((call) => !allowed.has(call)))];
  return { ok: invalidCalls.length === 0, invalidCalls };
}
