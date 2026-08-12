import type Anthropic from '@anthropic-ai/sdk';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStepCatalog } from './stepCatalog';
import { extractTodoLines, groundScenario, TODO_MARKER_PREFIX } from './grounding';
import type { StepDefinition, Suite } from './types';

export interface GenerateScenarioParams {
  description: string;
  suite: Suite;
  anthropic: Anthropic;
  model?: string;
  /** Defaults to process.cwd() — in Lambda this is /var/task, where build.mjs copies steps/ and features/. */
  repoRoot?: string;
}

export interface GenerateScenarioCoreResult {
  featureText: string;
  missingLines: string[];
}

function readExampleFeature(repoRoot: string, suite: Suite): string {
  const dir = join(repoRoot, 'features', suite);
  const files = readdirSync(dir).filter((f) => f.endsWith('.feature'));
  if (files.length === 0) return '';
  return readFileSync(join(dir, files[0]), 'utf-8');
}

function formatCatalog(catalog: StepDefinition[]): string {
  return catalog.map((s) => `- ${s.keyword} ${s.pattern}  (${s.sourceFile})`).join('\n');
}

function buildPrompt(description: string, suite: Suite, catalog: StepDefinition[], exampleFeature: string): { system: string; user: string } {
  const system = `You are a Gherkin scenario generator for a Playwright + playwright-bdd + Page Object Model project.

Strict rules:
1. You can only use steps from the provided catalog, copying each pattern's text and replacing the placeholders ({string}, {int}, etc.) with concrete values derived from the user's request. Don't change a single word of the pattern's fixed text.
2. If fulfilling the request needs an action no catalog step covers, do NOT invent a similar step and do NOT silently drop it. In the exact spot in the Scenario where that action would go, write a comment line with this exact format (respecting step indentation): "${TODO_MARKER_PREFIX}<Keyword> <proposed wording with concrete values, as if it were the real step>". Example: "${TODO_MARKER_PREFIX}Then the prices end up sorted from highest to lowest".
3. Generate concrete Scenarios (not Scenario Outline) with literal values.
4. Match the style of the example file: English wording, use Background where it applies, 2-space indentation.
5. Respond in EXACTLY this format, with no extra text before or after:

\`\`\`gherkin
@${suite}
Feature: <title>
  ...
\`\`\``;

  const user = `Catalog of existing steps for suite "${suite}" (the single source of truth, no others exist):
${formatCatalog(catalog)}

Style example from an existing .feature in the same suite:
\`\`\`gherkin
${exampleFeature}
\`\`\`

User's request in natural language:
"${description}"

Generate the Gherkin scenario following the rules.`;

  return { system, user };
}

function extractSection(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function ensureAiMarkers(featureText: string): string {
  const lines = featureText.split('\n');
  const tagLineIndex = lines.findIndex((l) => l.trim().startsWith('@'));
  if (tagLineIndex !== -1 && !lines[tagLineIndex].includes('@ai-generated')) {
    lines[tagLineIndex] = `${lines[tagLineIndex].trimEnd()} @ai-generated`;
  }
  return lines.join('\n');
}

/**
 * The grounded NL -> Gherkin generation step, with no filesystem writes and no
 * --implement-missing (that needs a real, multi-minute browser session — the wrong execution
 * model for a request/response Lambda). Shared by the CLI (ai/generateScenario.ts, which adds
 * file-writing and --implement-missing on top) and the Lambda handler (infra/lambda/handler.ts,
 * which just returns this result as JSON) so the anti-hallucination logic isn't duplicated.
 */
export async function generateScenarioCore(params: GenerateScenarioParams): Promise<GenerateScenarioCoreResult> {
  const repoRoot = params.repoRoot ?? process.cwd();
  const model = params.model ?? 'claude-sonnet-5';

  const catalog = extractStepCatalog(params.suite, repoRoot);
  if (catalog.length === 0) {
    throw new Error(`No steps found for suite "${params.suite}" in steps/${params.suite}/`);
  }
  const exampleFeature = readExampleFeature(repoRoot, params.suite);

  const { system, user } = buildPrompt(params.description, params.suite, catalog, exampleFeature);

  const response = await params.anthropic.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const rawFeature = extractSection(responseText, /```gherkin\n([\s\S]*?)```/) ?? responseText.trim();

  const { groundedText } = groundScenario(rawFeature, catalog);
  const markedFeature = ensureAiMarkers(groundedText.trim());

  // Single "missing" channel: lines the LLM itself marked on purpose (prompt rule 2) plus the
  // ones groundScenario caught as a safety net (steps it did write but hallucinated).
  const missingLines = extractTodoLines(markedFeature);

  return { featureText: markedFeature, missingLines };
}
