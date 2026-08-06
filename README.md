# playwright-bdd-pom

Proyecto base de automatización con **Playwright + TypeScript**, escritura de escenarios en **Gherkin** (BDD, vía [`playwright-bdd`](https://github.com/vitalets/playwright-bdd)) y arquitectura **Page Object Model (POM)**. Incluye pipeline de **GitHub Actions**.

## Sitios usados como ejemplo

| Sitio | Uso | Por qué |
|---|---|---|
| [demoqa.com](https://demoqa.com) | Formulario complejo (`/automation-practice-form`), tabla dinámica CRUD (`/webtables`), alertas nativas y modales (`/alerts`, `/modal-dialogs`) | Concentra widgets difíciles: date picker, autocomplete, react-select, dialogs nativos (`window.alert/confirm/prompt`), tablas React con búsqueda/paginación |
| [saucedemo.com](https://www.saucedemo.com) | Login con distintos usuarios, carrito, checkout end-to-end | Flujo de e-commerce estable, ideal para un caso de negocio completo y para probar `data-test` attributes |

## Estructura

```
features/            Escenarios Gherkin (.feature)
  demoqa/
  saucedemo/
steps/                Step definitions en TypeScript (mapean texto Gherkin -> Page Objects)
  demoqa/
  saucedemo/
pages/                Page Object Model
  common/BasePage.ts
  demoqa/
  saucedemo/
support/fixtures.ts   Fixtures de Playwright que instancian los Page Objects + createBdd()
ai/                   Generador de escenarios NL -> Gherkin con grounding anti-alucinación (ver más abajo)
playwright.config.ts  Config de Playwright, integra playwright-bdd (defineBddConfig)
.github/workflows/    Pipeline de CI
```

## Requisitos

- Node.js 20+

## Instalación

```bash
npm install
npx playwright install --with-deps
```

## Ejecutar los tests

```bash
npm test              # genera specs desde los .feature y corre todo (chromium/firefox/webkit)
npm run test:headed   # con navegador visible
npm run test:ui       # modo UI interactivo de Playwright
npm run test:demoqa   # solo escenarios @demoqa
npm run test:saucedemo # solo escenarios @saucedemo
npm run report        # abre el último reporte HTML
```

`playwright-bdd` transforma los archivos `.feature` en specs de Playwright dentro de `.features-gen/` (carpeta generada, ignorada en git) antes de ejecutar `playwright test`.

## Cómo se agrega un escenario nuevo

1. Escribe el `.feature` en `features/<sitio>/...feature` con los pasos en Gherkin.
2. Si el paso es nuevo, agrégalo en `steps/<sitio>/...steps.ts`, delegando la interacción con el DOM a un Page Object (no uses selectores directamente en el step).
3. Si el flujo necesita una página nueva, crea el Page Object en `pages/<sitio>/` extendiendo `BasePage`, y expón su fixture en `support/fixtures.ts`.

## Generador de escenarios con IA (`ai/generateScenario.ts`)

Convierte una descripción en español plano en un `.feature` nuevo, **reutilizando solo los steps que ya existen** en `steps/<sitio>/*.steps.ts` en vez de inventar sintaxis Gherkin sin implementar. Es el patrón de *grounding* aplicado a este proyecto: el catálogo real de steps es la única fuente de verdad, y toda línea generada se valida programáticamente antes de escribirse.

### Setup

```bash
cp .env.example .env   # completá ANTHROPIC_API_KEY (console.anthropic.com)
```

### Uso

```bash
npm run ai:generate -- "Agregar dos productos distintos al carrito y verificar que el contador muestre 2" --suite saucedemo
```

- `--suite` es obligatorio: `demoqa` o `saucedemo`.
- `--name <slug>` opcional, para fijar el nombre del archivo generado (por defecto se deriva de la descripción).

También se puede invocar desde el chat de Claude Code con el skill `generate-scenario` (`.claude/skills/generate-scenario/SKILL.md`), que corre este mismo comando y te resume el resultado.

### Cómo controla la alucinación

1. El prompt incluye el catálogo completo de steps del sitio (extraído en vivo de `steps/<sitio>/*.steps.ts`, ver `ai/stepCatalog.ts`) y le exige a Claude reutilizar ese texto literal, rellenando solo los placeholders.
2. Si una acción pedida no tiene step existente, el modelo no la omite en silencio ni la inventa: escribe, en el lugar exacto del Scenario donde iría, una línea `# TODO_AI_MISSING: <Keyword> <redacción propuesta>` (comentario Gherkin válido, bddgen lo ignora). Eso le da a `--implement-missing` un punto de anclaje real donde reinsertar el step si logra implementarlo.
3. Aun así, no se confía ciegamente en la instrucción: `ai/grounding.ts#groundScenario` recompila cada patrón del catálogo con `@cucumber/cucumber-expressions` y verifica que cada línea `Given/When/Then/And/But` del resultado matchee un step real. Cualquier línea que no matchea (el modelo no siguió la regla 2) se reemplaza en el lugar por el mismo tipo de marcador `# TODO_AI_MISSING:` — mismo canal, dos orígenes: uno proactivo (el modelo) y uno de red de seguridad (verificación programática).
4. El archivo final se escribe directo en `features/<sitio>/`, pero queda marcado con el tag `@ai-generated` y un comentario de cabecera — pensado para revisión humana antes de mergear, no para auto-aprobarse.

### Retrieval: por qué no hay embeddings todavía

El catálogo actual es chico (~30 steps), así que esta versión pasa el catálogo completo al prompt en vez de hacer retrieval real. El punto de extensión natural cuando el catálogo crezca (muchos sitios/steps, catálogo que ya no entra cómodo en el contexto) es precomputar embeddings de cada step y traer solo el top-K más relevante a la descripción — eso evita prompts gigantes y la pérdida de precisión que sufren los LLMs con mucho contexto irrelevante.

## Implementación autónoma de lo que falta (`--implement-missing`)

Cuando una acción pedida no tiene step existente, el generador puede ir un paso más allá de solo listarla: entrar al Page Object correspondiente, escribir el método nuevo con un selector real y el step que lo invoca, correr el escenario contra el sitio real, y si falla auto-corregirse hasta 3 intentos.

```bash
npm run ai:generate -- "Aplicar un cupón de descuento en el checkout" --suite saucedemo --implement-missing
```

Es opt-in porque es una corrida pesada: levanta browsers reales y hace varias llamadas a Claude por step faltante.

**Grounding de selectores (no solo de texto):** el problema de que el LLM invente selectores sin ver el DOM real es el mismo problema de alucinación que resolvimos para los steps, aplicado un nivel más abajo. La solución es la misma idea: no dejar que el modelo redacte el selector, dárselo como catálogo real.

1. **Sonda (`ai/domProbe.ts` + `ai/probeRuntime.ts`)**: se inserta un método temporal en el Page Object real que, en vez de implementar la acción, captura el DOM (`page.evaluate`) y corta la ejecución. Como el escenario ya tiene steps reales *antes* del que falta (login, agregar al carrito, etc.), la sonda hereda el estado real del flujo — no hace falta calcular una navegación aparte, Playwright ya está logueado / en el carrito / donde corresponda.
2. Para cada elemento interactivo visible, se arma de forma **determinística** (no la decide el LLM) un `suggestedLocator` con la misma prioridad que recomienda Playwright: `getByRole` → `getByLabel` → `getByPlaceholder` → `data-test` → `#id` → texto como último recurso. Si un locator matchearía a más de un elemento, se marca `weak` (no es único).
3. Claude recibe ese catálogo de selectores reales y escribe el método **eligiendo entre esas opciones**, nunca redactando uno propio. `ai/grounding.ts#groundGeneratedCode` verifica programáticamente que cada `page.getBy…`/`page.locator(...)` del código generado aparece literalmente en el digest — si no, se rechaza antes de gastar una corrida de browser.
4. El método (ya no la sonda) se corre de verdad contra el sitio real. Si pasa, el step deja de estar en "faltantes" y pasa a ser parte del `.feature`. Si falla, se repite desde el paso 2 con el error real como contexto adicional, hasta 3 intentos.
5. Si se agotan los intentos, el método queda en el Page Object marcado `// AVISO IA: no se pudo verificar automáticamente...` (para no perder el intento) pero el step **no** se activa en el `.feature` — nunca se deja un escenario corriendo que no se sabe si pasa.

Dónde queda el código nuevo:
- El método nuevo se agrega directo dentro del Page Object real correspondiente (no en un archivo aparte), marcado con `// Generado por IA (ai:generate --implement-missing) — revisar`.
- Los steps nuevos se agregan a `steps/<sitio>/ai-generated.steps.ts` (se crea si no existe) — es una ubicación real y activa (bddgen la toma automáticamente), separada de los archivos escritos a mano para no tocarlos con edición automática de texto.
- Antes de proponer un método nuevo, se revisa el catálogo de Page Objects (`ai/pageObjectCatalog.ts`) para reutilizar uno existente si ya cubre la acción, en vez de duplicar.

**Límite conocido:** si el step faltante es el primer step del escenario (no hay pasos previos que dejen la página en el estado correcto), la sonda no tiene forma de llegar a un estado más profundo que el `baseURL` del suite. No se resuelve con un sistema de "recetas" de navegación en esta versión.

## CI (GitHub Actions)

El workflow [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) corre en cada push/PR a `main`:

1. Instala dependencias (`npm ci`).
2. Genera los specs BDD (`npx bddgen`).
3. Instala los navegadores de Playwright.
4. Ejecuta los tests.
5. Sube como artefactos el reporte HTML de Playwright y el reporte Cucumber.

## Notas sobre los widgets complejos cubiertos

- **Date picker** (`practice-form.feature`): navegación por mes/año en vez de tipear texto libre.
- **Autocomplete** (`subjectsInput`): escribe y selecciona de una lista de sugerencias que se renderiza dinámicamente.
- **react-select** (State/City): no son `<select>` nativos; requieren click + click sobre la opción renderizada.
- **Diálogos nativos** (`alerts-and-modals.feature`): `alert`, `confirm`, `prompt` se manejan como eventos (`page.on('dialog')`), no como elementos del DOM — el listener se registra antes de disparar la acción.
- **Tabla React con CRUD** (`web-tables.feature`): alta/edición/borrado vía modal, búsqueda con filtrado dinámico de filas.
