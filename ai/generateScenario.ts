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
    throw new Error('Falta la descripción del escenario. Uso: npm run ai:generate -- "descripción" --suite demoqa|saucedemo');
  }
  if (!suite || !SUITES.includes(suite as Suite)) {
    throw new Error(`--suite es obligatorio y debe ser uno de: ${SUITES.join(', ')}`);
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
  const system = `Eres un generador de escenarios Gherkin para un proyecto Playwright + playwright-bdd + Page Object Model.

Reglas estrictas:
1. Solo puedes usar los steps del catálogo provisto, copiando el texto de cada patrón y reemplazando los placeholders ({string}, {int}, etc.) por valores concretos derivados del pedido del usuario. No cambies ni una palabra del texto fijo del patrón.
2. Si para cumplir el pedido hace falta una acción que ningún step del catálogo cubre, NO inventes un step parecido y NO lo omitas en silencio. En el lugar exacto del Scenario donde iría esa acción, escribí una línea de comentario con este formato exacto (respetando la indentación de los steps): "${TODO_MARKER_PREFIX}<Keyword> <redacción propuesta con valores concretos, como si fuera el step real>". Ejemplo: "${TODO_MARKER_PREFIX}Then los precios quedan ordenados de mayor a menor".
3. Genera Scenario concretos (no Scenario Outline) con valores literales.
4. Respeta el estilo del archivo de ejemplo: idioma español en la redacción, uso de Background si aplica, indentación de 2 espacios.
5. Responde EXACTAMENTE en este formato, sin texto adicional antes o después:

\`\`\`gherkin
@${suite}
Feature: <título>
  ...
\`\`\``;

  const user = `Catálogo de steps existentes para el suite "${suite}" (única fuente de verdad, no existen otros):
${formatCatalog(catalog)}

Ejemplo de estilo de un .feature existente del mismo suite:
\`\`\`gherkin
${exampleFeature}
\`\`\`

Pedido del usuario en lenguaje natural:
"${description}"

Generá el escenario Gherkin siguiendo las reglas.`;

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
    throw new Error(`No se encontraron steps para el suite "${args.suite}" en steps/${args.suite}/`);
  }
  const exampleFeature = readExampleFeature(repoRoot, args.suite);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY (configurala en .env, ver .env.example)');
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

  // Canal único de "falta esto": líneas que el propio LLM marcó a propósito (regla 2 del prompt)
  // más las que groundScenario detectó como red de seguridad (steps que sí escribió pero alucinó).
  const missingLines = extractTodoLines(markedFeature);

  const header = '# Generado por IA (ai:generate) — revisar antes de mergear';

  const outDir = join(repoRoot, 'features', args.suite);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const slug = args.name ? slugify(args.name) : slugify(args.description);
  const outPath = join(outDir, `${slug}.feature`);

  // Se escribe temprano: --implement-missing necesita un archivo real bajo features/<suite>/
  // para poder correrlo con bddgen + playwright test.
  writeFileSync(outPath, `${header}\n${markedFeature}\n`, 'utf-8');

  let allMissing = missingLines;
  if (args.implementMissing && missingLines.length > 0) {
    const report = await implementMissingSteps(anthropic, model, args.suite, missingLines, outPath, repoRoot);
    allMissing = report.unresolved;
  }
  const missingBlock =
    allMissing.length > 0
      ? `\n# Steps faltantes (no implementados, revisar/implementar antes de habilitar este escenario):\n${allMissing.map((s) => `#   ${s}`).join('\n')}\n`
      : '';

  if (missingBlock) appendFileSync(outPath, missingBlock, 'utf-8');

  console.log(`\nEscenario generado: ${outPath}`);
  if (allMissing.length > 0) {
    console.log('\nSteps faltantes:');
    for (const step of allMissing) console.log(`  - ${step}`);
  } else {
    console.log('Todos los steps usados ya existen o se implementaron y verificaron.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
