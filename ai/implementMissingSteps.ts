import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type Anthropic from '@anthropic-ai/sdk';
import { extractPageObjectCatalog } from './pageObjectCatalog';
import { readProbe, PROBE_MARKER } from './probeRuntime';
import { insertPageObjectMember, replacePageObjectMethod, AI_MARKER_PREFIX, AI_UNVERIFIED_PREFIX } from './codeInsertion';
import { groundGeneratedCode, matchesPattern, TODO_MARKER_PREFIX } from './grounding';
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function extractCode(text: string): string | null {
  const match = text.match(/```typescript\n([\s\S]*?)```/) ?? text.match(/```ts\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function formatPageObjectCatalog(catalog: PageObjectDefinition[]): string {
  return catalog
    .map((p) => `- ${p.className} (fixture: ${p.fixtureName}, ${p.filePath})\n  Métodos existentes: ${p.methods.join(', ') || '(ninguno)'}`)
    .join('\n');
}

function formatDigest(digest: DomElementSummary[]): string {
  return digest.map((d) => `- ${d.suggestedLocator}${d.accessibleName ? `  // "${d.accessibleName}"` : ''}`).join('\n');
}

async function askClaude(anthropic: Anthropic, model: string, system: string, user: string): Promise<string> {
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
  const system = `Sos un asistente que decide cómo implementar un step de Playwright/Gherkin que falta.
Respondé EXCLUSIVAMENTE con un bloque \`\`\`json con estas claves:
{
  "pageClassName": "<uno de los Page Objects listados>",
  "methodName": "<nombre de método nuevo o existente, camelCase>",
  "methodParams": "<lista de parámetros TS, ej. 'code: string', o vacío si no hace falta>",
  "methodReturnType": "<ej. Promise<void>>",
  "stepKeyword": "Given" | "When" | "Then",
  "stepPattern": "<cucumber expression>",
  "stepDefinitionCode": "<código TS completo del step definition, estilo del repo>"
}

Reglas:
1. "stepPattern" DEBE matchear textualmente la línea Gherkin original de abajo, reemplazando únicamente los valores literales entre comillas por {string} (o números por {int}) — no cambies ninguna otra palabra.
2. Si en "Métodos existentes" del Page Object elegido ya hay uno que sirve para esto, reutilizalo (mismo methodName) en vez de proponer uno nuevo.
3. "stepDefinitionCode" debe ser SOLO la llamada a Given/When/Then, sin ningún "import": el archivo destino ya tiene arriba "import { expect } from '@playwright/test'; import { Given, When, Then } from '../../support/fixtures';". Formato exacto: ${'${stepKeyword}'}('<pattern>', async ({ fixtureName }, ...args) => { await fixtureName.methodName(...); });`;

  const user = `Suite: ${suite}
Línea Gherkin faltante (original, con valores concretos):
${missingLine}

Page Objects disponibles:
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
  const system = `Sos un generador de métodos de Page Object para Playwright + TypeScript.
Tenés que escribir la implementación real de un método, usando SOLO los selectores reales listados abajo (copiándolos literalmente) — no inventes ningún page.getBy…/page.locator(...) que no esté en la lista.
Respondé EXCLUSIVAMENTE con un bloque \`\`\`typescript que contenga el método completo (firma + cuerpo), con esta firma exacta:
async ${plan.methodName}(${plan.methodParams}): ${plan.methodReturnType} { ... }`;

  const user = `Acción que debe cumplir el método (derivada de este step Gherkin):
${missingLine}

Selectores reales disponibles en la página en este punto del flujo (elegí entre estos, no inventes otros):
${formatDigest(digest)}
${previousError ? `\nEl intento anterior falló al correr el test real, con este error:\n${previousError.slice(-3000)}\n\nCorregí la implementación teniendo esto en cuenta.` : ''}`;

  const text = await askClaude(anthropic, model, system, user);
  return extractCode(text);
}

// spawnSync('npx.cmd', [...]) sin shell tira EINVAL en Windows (bug conocido de Node al spawnear
// .cmd directamente). shell:true con un array de args tampoco sirve: Node solo concatena, no cita,
// así que "Ordenar productos de mayor a menor precio" se partía en argumentos sueltos y --grep
// terminaba matcheando cualquier escenario con "Ordenar". La solución que funciona en los dos
// sistemas: un único string de comando con shell:true, citando a mano el valor de --grep.
function shQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function runPlaywright(repoRoot: string, grepTitle: string): { exitCode: number; output: string } {
  const bddgen = spawnSync('npx bddgen', [], { cwd: repoRoot, encoding: 'utf-8', shell: true });
  // Solo chromium: el loop de sonda/reintentos corre el escenario varias veces, no hace falta
  // pagar 3 browsers por intento — la verificación cross-browser final la hace `npm test`.
  const testCmd = `npx playwright test --grep ${shQuote(escapeRegExp(grepTitle))} --project=chromium --reporter=line`;
  const test = spawnSync(testCmd, [], { cwd: repoRoot, encoding: 'utf-8', shell: true });
  // Sin truncar: la detección del marcador de sonda busca en todo el output. Quien lo mande a un
  // prompt (generateMethodBody) trunca recién ahí, para no arriesgarse a cortar el marcador.
  const errorText = [bddgen.error?.message, test.error?.message].filter(Boolean).join('\n');
  const output = `${bddgen.stdout ?? ''}${bddgen.stderr ?? ''}${test.stdout ?? ''}${test.stderr ?? ''}${errorText}`;
  return { exitCode: test.error ? 1 : (test.status ?? 1), output };
}

function extractScenarioTitle(featureText: string): string | null {
  const match = featureText.match(/^\s*Scenario:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

/** Solo se llama una vez por step faltante (no por intento): el step definition no cambia entre reintentos, solo el cuerpo del método. */
function appendGeneratedStep(repoRoot: string, suite: Suite, stepDefinitionCode: string): void {
  const filePath = join(repoRoot, 'steps', suite, 'ai-generated.steps.ts');
  if (!existsSync(filePath)) {
    writeFileSync(
      filePath,
      "import { expect } from '@playwright/test';\nimport { Given, When, Then } from '../../support/fixtures';\n",
      'utf-8',
    );
  }
  // Red de seguridad: el archivo ya trae los imports que hacen falta arriba (Given/When/Then/expect).
  // Si el LLM igual escribió alguno propio (ignorando la instrucción), se descarta antes de escribir.
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
 * Para cada línea `# TODO_AI_MISSING: ...` dejada por ai/grounding.ts, intenta escribir el
 * método de Page Object + step real, verificado contra el DOM real y corrido de verdad, con
 * reintentos acotados. Opera directo sobre `featurePath` (tiene que ser un archivo real bajo
 * features/<suite>/, porque bddgen + playwright test necesitan encontrarlo en disco para correrlo).
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
    console.log(`\nImplementando: ${missingLine}`);
    const todoLine = `${TODO_MARKER_PREFIX}${missingLine}`;

    const pageCatalog = extractPageObjectCatalog(suite, repoRoot);
    const plan = await planImplementation(anthropic, model, suite, missingLine, pageCatalog);
    if (!plan || !grepTitle) {
      console.log('  No se pudo planificar una implementación válida.');
      unresolved.push(missingLine);
      continue;
    }

    const page = pageCatalog.find((p) => p.className === plan.pageClassName)!;
    const pageFilePath = join(repoRoot, page.filePath);
    const isReuse = page.methods.includes(plan.methodName);

    appendGeneratedStep(repoRoot, suite, plan.stepDefinitionCode);
    // Habilita el step en el escenario real para poder correrlo (se revierte más abajo si no se verifica).
    replaceInFile(featurePath, todoLine, missingLine);

    let resolved = false;
    let lastError: string | null = null;

    if (isReuse) {
      console.log(`  Reutilizando método existente ${plan.pageClassName}.${plan.methodName} (sin duplicar).`);
      // Mismo margen de reintentos que la rama de implementación nueva: una corrida sola contra
      // un sitio real puede fallar por algo transitorio (red, timing), no solo por lógica.
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !resolved; attempt++) {
        const run = runPlaywright(repoRoot, grepTitle);
        resolved = run.exitCode === 0;
        if (resolved) {
          console.log(`  Intento ${attempt}: OK, el escenario pasa.`);
        } else {
          lastError = run.output;
          console.log(`  Intento ${attempt}: el test falló.`);
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
          console.log(`  Intento ${attempt}: la sonda no llegó a capturar el DOM (fallo previo en el flujo).`);
          lastError = probeRun.output;
          continue;
        }

        const digest = readProbe(probeId);
        const methodCode = await generateMethodBody(anthropic, model, missingLine, plan, digest, lastError);
        if (!methodCode) {
          console.log(`  Intento ${attempt}: no se pudo generar una implementación parseable.`);
          continue;
        }

        const grounding = groundGeneratedCode(methodCode, digest);
        if (!grounding.ok) {
          console.log(`  Intento ${attempt}: selectores no verificados en el DOM real: ${grounding.invalidCalls.join(', ')}`);
          lastError = `Usaste selectores que no existen en el digest: ${grounding.invalidCalls.join(', ')}`;
          continue;
        }

        replacePageObjectMethod(pageFilePath, plan.pageClassName, plan.methodName, methodCode);
        const realRun = runPlaywright(repoRoot, grepTitle);
        if (realRun.exitCode === 0) {
          console.log(`  Intento ${attempt}: OK, el escenario pasa.`);
          resolved = true;
        } else {
          console.log(`  Intento ${attempt}: el test falló, reintentando con el error como contexto.`);
          lastError = realRun.output;
        }
      }
    }

    if (!resolved) {
      // No se deja un escenario activo que no se sabe si pasa: se revierte el step a "faltante".
      replaceInFile(featurePath, missingLine, todoLine);
      if (!isReuse) {
        try {
          replacePageObjectMethod(
            pageFilePath,
            plan.pageClassName,
            plan.methodName,
            `${AI_UNVERIFIED_PREFIX}\nasync ${plan.methodName}(${plan.methodParams}): ${plan.methodReturnType} {\n  throw new Error('Implementación IA sin verificar automáticamente');\n}`,
          );
        } catch {
          // No se llegó a insertar ningún stub (falló antes de eso): no hay nada que marcar.
        }
      }
      unresolved.push(`${missingLine} (intentado, no verificado — revisar ${plan.pageClassName}.${plan.methodName})`);
    }
  }

  return { unresolved };
}

function replaceInFile(filePath: string, search: string, replacement: string): void {
  const content = readFileSync(filePath, 'utf-8');
  writeFileSync(filePath, content.replace(search, replacement), 'utf-8');
}
