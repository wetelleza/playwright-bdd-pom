import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { extractPageObjectCatalog } from './pageObjectCatalog';
import { readProbe, PROBE_MARKER } from './probeRuntime';
import { insertPageObjectMember, replacePageObjectMethod, AI_MARKER_PREFIX, AI_UNVERIFIED_PREFIX } from './codeInsertion';
import { groundGeneratedCode, matchesPattern, TODO_MARKER_PREFIX } from './grounding';
import { runPlaywright } from './testRunner';
import type { DomElementSummary, PageObjectDefinition, Suite } from './types';

const MAX_ATTEMPTS = 3;
const PROBE_IMPORT_LINE = "import { captureProbe } from '../../ai/probeRuntime';";

interface Plan {
  pageClassName: string;
  methodName: string;
  methodParams: string;
  methodReturnType: string;
  stepKeyword: 'Given' | 'When' | 'Then';
  stepPattern: string;
  stepDefinitionCode: string;
}

function extractJson<T>(text: string): T | null {
  const match = text.match(/```json\n([\s\S]*?)```/) ?? text.match(/{[\s\S]*}/);
  if (!match) return null;
  try {
    return JSON.parse(match[1] ?? match[0]) as T;
  } catch {
    return null;
  }
}

export function extractCode(text: string): string | null {
  const match = text.match(/```typescript\n([\s\S]*?)```/) ?? text.match(/```ts\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function formatPageObjectCatalog(catalog: PageObjectDefinition[]): string {
  return catalog
    .map((p) => `- ${p.className} (fixture: ${p.fixtureName}, ${p.filePath})\n  Existing methods: ${p.methods.join(', ') || '(none)'}`)
    .join('\n');
}

function formatDigest(digest: DomElementSummary[]): string {
  return digest.map((d) => `- ${d.suggestedLocator}${d.accessibleName ? `  // "${d.accessibleName}"` : ''}`).join('\n');
}

export async function askClaude(anthropic: Anthropic, model: string, system: string, user: string): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function planImplementation(
  anthropic: Anthropic,
  model: string,
  suite: Suite,
  missingLine: string,
  pageCatalog: PageObjectDefinition[],
): Promise<Plan | null> {
  const system = `You're an assistant that decides how to implement a missing Playwright/Gherkin step.
Respond EXCLUSIVELY with a \`\`\`json block with these keys:
{
  "pageClassName": "<one of the listed Page Objects>",
  "methodName": "<new or existing method name, camelCase>",
  "methodParams": "<TS parameter list, e.g. 'code: string', or empty if not needed>",
  "methodReturnType": "<e.g. Promise<void>>",
  "stepKeyword": "Given" | "When" | "Then",
  "stepPattern": "<cucumber expression>",
  "stepDefinitionCode": "<full TS code for the step definition, in this repo's style>"
}

Rules:
1. "stepPattern" MUST match the original Gherkin line below word for word, only replacing the literal quoted values with {string} (or numbers with {int}) — don't change any other word.
2. If the chosen Page Object's "Existing methods" already has one that serves this purpose, reuse it (same methodName) instead of proposing a new one.
3. "stepDefinitionCode" must be ONLY the Given/When/Then call, with no "import": the target file already has "import { expect } from '@playwright/test'; import { Given, When, Then } from '../../support/fixtures';" at the top. Exact format: ${'${stepKeyword}'}('<pattern>', async ({ fixtureName }, ...args) => { await fixtureName.methodName(...); });`;

  const user = `Suite: ${suite}
Missing Gherkin line (original, with concrete values):
${missingLine}

Available Page Objects:
${formatPageObjectCatalog(pageCatalog)}`;

  const text = await askClaude(anthropic, model, system, user);
  const plan = extractJson<Plan>(text);
  if (!plan) return null;
  if (!pageCatalog.some((p) => p.className === plan.pageClassName)) return null;

  const keywordMatch = missingLine.match(/^(?:Given|When|Then|And|But)\s+(.+)$/);
  if (!keywordMatch) return null;
  if (!matchesPattern(plan.stepPattern, keywordMatch[1])) return null;

  return plan;
}

async function generateMethodBody(
  anthropic: Anthropic,
  model: string,
  missingLine: string,
  plan: Plan,
  digest: DomElementSummary[],
  previousError: string | null,
): Promise<string | null> {
  const system = `You're a Page Object method generator for Playwright + TypeScript.
You have to write the real implementation of a method, using ONLY the real selectors listed below (copying them literally) — don't invent any page.getBy…/page.locator(...) that isn't in the list.
Respond EXCLUSIVELY with a \`\`\`typescript block containing the full method (signature + body), with this exact signature:
async ${plan.methodName}(${plan.methodParams}): ${plan.methodReturnType} { ... }`;

  const user = `Action the method must fulfil (derived from this Gherkin step):
${missingLine}

Real selectors available on the page at this point in the flow (pick among these, don't invent others):
${formatDigest(digest)}
${previousError ? `\nThe previous attempt failed when running the real test, with this error:\n${previousError.slice(-3000)}\n\nFix the implementation taking this into account.` : ''}`;

  const text = await askClaude(anthropic, model, system, user);
  return extractCode(text);
}

function extractScenarioTitle(featureText: string): string | null {
  const match = featureText.match(/^\s*Scenario:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

/** Only called once per missing step (not per attempt): the step definition doesn't change between retries, only the method body does. */
function appendGeneratedStep(repoRoot: string, suite: Suite, stepDefinitionCode: string): void {
  const filePath = join(repoRoot, 'steps', suite, 'ai-generated.steps.ts');
  if (!existsSync(filePath)) {
    writeFileSync(
      filePath,
      "import { expect } from '@playwright/test';\nimport { Given, When, Then } from '../../support/fixtures';\n",
      'utf-8',
    );
  }
  // Safety net: the file already has the imports it needs at the top (Given/When/Then/expect).
  // If the LLM wrote its own anyway (ignoring the instruction), it's dropped before writing.
  const codeWithoutImports = stepDefinitionCode
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .join('\n')
    .trim();
  appendFileSync(filePath, `\n${AI_MARKER_PREFIX}\n${codeWithoutImports}\n`, 'utf-8');
}

export interface ImplementReport {
  unresolved: string[];
}

/**
 * For each `# TODO_AI_MISSING: ...` line left by ai/grounding.ts, tries to write the Page
 * Object method + real step, verified against the real DOM and actually run, with bounded
 * retries. Operates directly on `featurePath` (has to be a real file under features/<suite>/,
 * because bddgen + playwright test need to find it on disk to run it).
 */
export async function implementMissingSteps(
  anthropic: Anthropic,
  model: string,
  suite: Suite,
  missingLines: string[],
  featurePath: string,
  repoRoot: string = process.cwd(),
): Promise<ImplementReport> {
  const unresolved: string[] = [];
  const grepTitle = extractScenarioTitle(readFileSync(featurePath, 'utf-8'));

  for (const missingLine of missingLines) {
    console.log(`\nImplementing: ${missingLine}`);
    const todoLine = `${TODO_MARKER_PREFIX}${missingLine}`;

    const pageCatalog = extractPageObjectCatalog(suite, repoRoot);
    const plan = await planImplementation(anthropic, model, suite, missingLine, pageCatalog);
    if (!plan || !grepTitle) {
      console.log('  Could not plan a valid implementation.');
      unresolved.push(missingLine);
      continue;
    }

    const page = pageCatalog.find((p) => p.className === plan.pageClassName)!;
    const pageFilePath = join(repoRoot, page.filePath);
    const isReuse = page.methods.includes(plan.methodName);

    appendGeneratedStep(repoRoot, suite, plan.stepDefinitionCode);
    // Enables the step in the real scenario so it can be run (reverted below if it doesn't verify).
    replaceInFile(featurePath, todoLine, missingLine);

    let resolved = false;
    let lastError: string | null = null;

    if (isReuse) {
      console.log(`  Reusing existing method ${plan.pageClassName}.${plan.methodName} (no duplication).`);
      // Same retry margin as the new-implementation branch: a single run against a real site
      // can fail for something transient (network, timing), not just logic.
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !resolved; attempt++) {
        const run = runPlaywright(repoRoot, grepTitle);
        resolved = run.exitCode === 0;
        if (resolved) {
          console.log(`  Attempt ${attempt}: OK, the scenario passes.`);
        } else {
          lastError = run.output;
          console.log(`  Attempt ${attempt}: the test failed.`);
        }
      }
    } else {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !resolved; attempt++) {
        const probeId = `${plan.methodName}-${Date.now()}-${attempt}`;
        const stubCode = `${AI_MARKER_PREFIX}\nasync ${plan.methodName}(${plan.methodParams}): ${plan.methodReturnType} {\n  await captureProbe(this.page, '${probeId}');\n}`;

        if (attempt === 1) {
          insertPageObjectMember(pageFilePath, plan.pageClassName, { importLine: PROBE_IMPORT_LINE, methodCode: stubCode });
        } else {
          replacePageObjectMethod(pageFilePath, plan.pageClassName, plan.methodName, stubCode);
        }

        const probeRun = runPlaywright(repoRoot, grepTitle);
        if (!probeRun.output.includes(PROBE_MARKER)) {
          console.log(`  Attempt ${attempt}: the probe didn't manage to capture the DOM (earlier failure in the flow).`);
          lastError = probeRun.output;
          continue;
        }

        const digest = readProbe(probeId);
        const methodCode = await generateMethodBody(anthropic, model, missingLine, plan, digest, lastError);
        if (!methodCode) {
          console.log(`  Attempt ${attempt}: could not generate a parseable implementation.`);
          continue;
        }

        const grounding = groundGeneratedCode(methodCode, digest);
        if (!grounding.ok) {
          console.log(`  Attempt ${attempt}: selectors not verified against the real DOM: ${grounding.invalidCalls.join(', ')}`);
          lastError = `You used selectors that don't exist in the digest: ${grounding.invalidCalls.join(', ')}`;
          continue;
        }

        replacePageObjectMethod(pageFilePath, plan.pageClassName, plan.methodName, methodCode);
        const realRun = runPlaywright(repoRoot, grepTitle);
        if (realRun.exitCode === 0) {
          console.log(`  Attempt ${attempt}: OK, the scenario passes.`);
          resolved = true;
        } else {
          console.log(`  Attempt ${attempt}: the test failed, retrying with the error as context.`);
          lastError = realRun.output;
        }
      }
    }

    if (!resolved) {
      // Never leave an active scenario whose outcome is unknown: the step is reverted to "missing".
      replaceInFile(featurePath, missingLine, todoLine);
      if (!isReuse) {
        try {
          replacePageObjectMethod(
            pageFilePath,
            plan.pageClassName,
            plan.methodName,
            `${AI_UNVERIFIED_PREFIX}\nasync ${plan.methodName}(${plan.methodParams}): ${plan.methodReturnType} {\n  throw new Error('Unverified AI implementation');\n}`,
          );
        } catch {
          // No stub was ever inserted (it failed before that): nothing to mark.
        }
      }
      unresolved.push(`${missingLine} (attempted, not verified — review ${plan.pageClassName}.${plan.methodName})`);
    }
  }

  return { unresolved };
}

function replaceInFile(filePath: string, search: string, replacement: string): void {
  const content = readFileSync(filePath, 'utf-8');
  writeFileSync(filePath, content.replace(search, replacement), 'utf-8');
}
