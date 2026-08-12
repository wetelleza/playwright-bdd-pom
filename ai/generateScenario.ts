import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStepCatalog } from './stepCatalog';
import { extractTodoLines, groundScenario, TODO_MARKER_PREFIX } from './grounding';
import { implementMissingSteps } from './implementMissingSteps';
import { SUITES, type StepDefinition, type Suite } from './types';

interface CliArgs {
  description: string;
  suite: Suite;
  name?: string;
  implementMissing: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let suite: string | undefined;
  let name: string | undefined;
  let implementMissing = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--suite') {
      suite = argv[++i];
    } else if (arg === '--name') {
      name = argv[++i];
    } else if (arg === '--implement-missing') {
      implementMissing = true;
    } else {
      positional.push(arg);
    }
  }

  const description = positional.join(' ').trim();
  if (!description) {
    throw new Error('Missing scenario description. Usage: npm run ai:generate -- "description" --suite demoqa|saucedemo');
  }
  if (!suite || !SUITES.includes(suite as Suite)) {
    throw new Error(`--suite is required and must be one of: ${SUITES.join(', ')}`);
  }

  return { description, suite: suite as Suite, name, implementMissing };
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
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

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  const catalog = extractStepCatalog(args.suite, repoRoot);
  if (catalog.length === 0) {
    throw new Error(`No steps found for suite "${args.suite}" in steps/${args.suite}/`);
  }
  const exampleFeature = readExampleFeature(repoRoot, args.suite);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY (set it in .env, see .env.example)');
  }
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

  const { system, user } = buildPrompt(args.description, args.suite, catalog, exampleFeature);

  const response = await anthropic.messages.create({
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

  const header = '# Generated by AI (ai:generate) — review before merging';

  const outDir = join(repoRoot, 'features', args.suite);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const slug = args.name ? slugify(args.name) : slugify(args.description);
  const outPath = join(outDir, `${slug}.feature`);

  // Written early: --implement-missing needs a real file under features/<suite>/ to be able
  // to run it with bddgen + playwright test.
  writeFileSync(outPath, `${header}\n${markedFeature}\n`, 'utf-8');

  let allMissing = missingLines;
  if (args.implementMissing && missingLines.length > 0) {
    const report = await implementMissingSteps(anthropic, model, args.suite, missingLines, outPath, repoRoot);
    allMissing = report.unresolved;
  }
  const missingBlock =
    allMissing.length > 0
      ? `\n# Missing steps (not implemented, review/implement before enabling this scenario):\n${allMissing.map((s) => `#   ${s}`).join('\n')}\n`
      : '';

  if (missingBlock) appendFileSync(outPath, missingBlock, 'utf-8');

  console.log(`\nScenario generated: ${outPath}`);
  if (allMissing.length > 0) {
    console.log('\nMissing steps:');
    for (const step of allMissing) console.log(`  - ${step}`);
  } else {
    console.log('All steps used already existed or were implemented and verified.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
