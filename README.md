# playwright-bdd-pom

Automation base project with **Playwright + TypeScript**, scenarios written in **Gherkin** (BDD, via [`playwright-bdd`](https://github.com/vitalets/playwright-bdd)) and **Page Object Model (POM)** architecture. Includes a **GitHub Actions** pipeline.

## Sites used as examples

| Site | Use | Why |
|---|---|---|
| [demoqa.com](https://demoqa.com) | Complex form (`/automation-practice-form`), dynamic CRUD table (`/webtables`), native alerts and modals (`/alerts`, `/modal-dialogs`) | Concentrates tricky widgets: date picker, autocomplete, react-select, native dialogs (`window.alert/confirm/prompt`), React tables with search/pagination |
| [saucedemo.com](https://www.saucedemo.com) | Login with different users, cart, end-to-end checkout | Stable e-commerce flow, ideal for a full business case and for testing `data-test` attributes |

## Structure

```
features/            Gherkin scenarios (.feature)
  demoqa/
  saucedemo/
steps/                Step definitions in TypeScript (map Gherkin text -> Page Objects)
  demoqa/
  saucedemo/
pages/                Page Object Model
  common/BasePage.ts
  demoqa/
  saucedemo/
support/fixtures.ts   Playwright fixtures that instantiate the Page Objects + createBdd()
ai/                   NL -> Gherkin scenario generator with anti-hallucination grounding (see below)
report/               Executive report for stakeholders built from Playwright's JSON output (see below)
playwright.config.ts  Playwright config, integrates playwright-bdd (defineBddConfig)
.github/workflows/    CI pipeline
```

## Requirements

- Node.js 20+

## Installation

```bash
npm install
npx playwright install --with-deps
```

## Running the tests

```bash
npm test              # generates specs from the .feature files and runs everything (chromium/firefox/webkit)
npm run test:headed   # with a visible browser
npm run test:ui       # Playwright's interactive UI mode
npm run test:demoqa   # only @demoqa scenarios
npm run test:saucedemo # only @saucedemo scenarios
npm run report        # opens the last HTML report
```

`playwright-bdd` transforms `.feature` files into Playwright specs inside `.features-gen/` (generated folder, ignored by git) before running `playwright test`.

## Executive report (`report/`)

The Playwright and Cucumber reports are built for an engineer (stack traces, selectors, traces). For someone non-technical who just needs to know "is everything OK?", there's a separate report, with none of that:

```bash
npm test              # (or npm run test:saucedemo / test:demoqa) generates test-results/results.json
npm run report:exec   # reads that JSON and generates executive-report/index.html
```

Shows pass rate, pass rate by site (DemoQA/SauceDemo) and by browser, and — if there are failures — a plain-language list (no code, no stack traces). In CI it's generated and uploaded as an artifact on every run, even if there were failures.

## How to add a new scenario

1. Write the `.feature` in `features/<site>/...feature` with the steps in Gherkin.
2. If the step is new, add it in `steps/<site>/...steps.ts`, delegating DOM interaction to a Page Object (don't use selectors directly in the step).
3. If the flow needs a new page, create the Page Object in `pages/<site>/` extending `BasePage`, and expose its fixture in `support/fixtures.ts`.

## AI scenario generator (`ai/generateScenario.ts`)

Converts a plain-English description into a new `.feature`, **reusing only the steps that already exist** in `steps/<site>/*.steps.ts` instead of inventing unimplemented Gherkin syntax. It's the *grounding* pattern applied to this project: the real step catalog is the single source of truth, and every generated line is validated programmatically before being written.

### Setup

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY (console.anthropic.com)
```

### Usage

```bash
npm run ai:generate -- "Add two different products to the cart and verify the counter shows 2" --suite saucedemo
```

- `--suite` is required: `demoqa` or `saucedemo`.
- `--name <slug>` optional, to set the generated file's name (derived from the description by default).

It can also be invoked from the Claude Code chat with the `generate-scenario` skill (`.claude/skills/generate-scenario/SKILL.md`), which runs this same command and summarizes the result for you.

### How it controls hallucination

1. The prompt includes the full step catalog for the site (extracted live from `steps/<site>/*.steps.ts`, see `ai/stepCatalog.ts`) and requires Claude to reuse that literal text, only filling in the placeholders.
2. If a requested action has no existing step, the model doesn't silently drop it or invent one: it writes, in the exact spot in the Scenario where it would go, a `# TODO_AI_MISSING: <Keyword> <proposed wording>` line (a valid Gherkin comment, bddgen ignores it). That gives `--implement-missing` a real anchor point to reinsert the step if it manages to implement it.
3. Even so, the instruction isn't blindly trusted: `ai/grounding.ts#groundScenario` recompiles every catalog pattern with `@cucumber/cucumber-expressions` and verifies that every `Given/When/Then/And/But` line in the result matches a real step. Any line that doesn't match (the model didn't follow rule 2) gets replaced in place with the same kind of `# TODO_AI_MISSING:` marker — same channel, two sources: one proactive (the model) and one as a safety net (programmatic verification).
4. The final file is written directly into `features/<site>/`, but marked with the `@ai-generated` tag and a header comment — meant for human review before merging, not for auto-approval.

### Retrieval: why there are no embeddings yet

The current catalog is small (~30 steps), so this version passes the whole catalog to the prompt instead of doing real retrieval. The natural extension point when the catalog grows (many sites/steps, catalog that no longer fits comfortably in context) is to precompute embeddings for each step and bring in only the top-K most relevant to the description — that avoids giant prompts and the precision loss LLMs suffer with a lot of irrelevant context.

## Autonomous implementation of what's missing (`--implement-missing`)

When a requested action has no existing step, the generator can go a step further than just listing it: go into the matching Page Object, write the new method with a real selector and the step that calls it, run the scenario against the real site, and self-correct up to 3 attempts if it fails.

```bash
npm run ai:generate -- "Apply a discount coupon at checkout" --suite saucedemo --implement-missing
```

It's opt-in because it's a heavy run: it spins up real browsers and makes several Claude calls per missing step.

**Selector grounding (not just text):** the problem of the LLM inventing selectors without seeing the real DOM is the same hallucination problem we solved for steps, one level down. The solution is the same idea: don't let the model write the selector, give it a real catalog instead.

1. **Probe (`ai/domProbe.ts` + `ai/probeRuntime.ts`)**: a temporary method is inserted into the real Page Object that, instead of implementing the action, captures the DOM (`page.evaluate`) and stops execution. Since the scenario already has real steps *before* the missing one (login, add to cart, etc.), the probe inherits the real state of the flow — no need to compute navigation separately, Playwright is already logged in / in the cart / wherever it needs to be.
2. For every visible interactive element, a `suggestedLocator` is built **deterministically** (the LLM doesn't decide it) with the same priority Playwright recommends: `getByRole` → `getByLabel` → `getByPlaceholder` → `data-test` → `#id` → text as a last resort. If a locator would match more than one element, it's marked `weak` (not unique).
3. Claude receives that catalog of real selectors and writes the method **choosing among those options**, never writing its own. `ai/grounding.ts#groundGeneratedCode` programmatically verifies that every `page.getBy…`/`page.locator(...)` in the generated code appears literally in the digest — if not, it's rejected before spending a browser run.
4. The method (no longer the probe) is run for real against the real site. If it passes, the step stops being "missing" and becomes part of the `.feature`. If it fails, it repeats from step 2 with the real error as extra context, up to 3 attempts.
5. If the attempts run out, the method stays in the Page Object marked `// AI WARNING: could not be verified automatically...` (so the attempt isn't lost) but the step is **not** enabled in the `.feature` — an active scenario whose outcome is unknown is never left running.

Where the new code ends up:
- The new method is added directly inside the matching real Page Object (not in a separate file), marked with `// Generated by AI (ai:generate --implement-missing) — review`.
- New steps are added to `steps/<site>/ai-generated.steps.ts` (created if it doesn't exist) — a real, active location (bddgen picks it up automatically), kept separate from hand-written files so those aren't touched by automated text editing.
- Before proposing a new method, the Page Object catalog (`ai/pageObjectCatalog.ts`) is checked to reuse an existing one if it already covers the action, instead of duplicating.

**Known limitation:** if the missing step is the first step of the scenario (no earlier steps leave the page in the right state), the probe has no way to reach a deeper state than the suite's `baseURL`. This isn't solved with a navigation "recipe" system in this version.

## CI (GitHub Actions)

The [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) workflow runs on every push/PR to `main`:

1. Installs dependencies (`npm ci`).
2. Generates the BDD specs (`npx bddgen`).
3. Installs Playwright's browsers.
4. Runs the tests.
5. Generates and uploads the executive report as an artifact, even if there were failures.
6. Uploads the Playwright HTML report and the Cucumber report as artifacts.

## Notes on the complex widgets covered

- **Date picker** (`practice-form.feature`): navigates month/year instead of typing free text.
- **Autocomplete** (`subjectsInput`): types and selects from a suggestion list that renders dynamically.
- **react-select** (State/City): not native `<select>` elements; requires click + click on the rendered option.
- **Native dialogs** (`alerts-and-modals.feature`): `alert`, `confirm`, `prompt` are handled as events (`page.on('dialog')`), not DOM elements — the listener is registered before triggering the action.
- **React table with CRUD** (`web-tables.feature`): create/edit/delete via modal, search with dynamic row filtering.
