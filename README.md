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
  api/
steps/                Step definitions in TypeScript (map Gherkin text -> Page Objects/API client)
  demoqa/
  saucedemo/
  api/
pages/                Page Object Model (UI)
  common/BasePage.ts
  demoqa/
  saucedemo/
clients/ApiClient.ts  The API-testing equivalent of a Page Object (wraps APIRequestContext)
support/fixtures.ts   Playwright fixtures that instantiate the Page Objects/API client + createBdd()
api-server/           Small Express + TypeScript backend used as a real target for the API tests (see below)
ai/                   NL -> Gherkin scenario generator with anti-hallucination grounding (see below)
report/               Executive report for stakeholders built from Playwright's JSON output (see below)
infra/                CDK app: the generator exposed as a Lambda + API Gateway endpoint (see below)
playwright.config.ts  Playwright config, integrates playwright-bdd (defineBddConfig)
Dockerfile            Test runner image; api-server/Dockerfile + docker-compose.yml (see below)
.github/workflows/    CI pipeline (Docker) + Lambda deploy pipeline (OIDC)
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
npm test              # generates specs from the .feature files and runs everything (chromium/firefox/webkit + api)
npm run test:headed   # with a visible browser
npm run test:ui       # Playwright's interactive UI mode
npm run test:demoqa   # only @demoqa scenarios
npm run test:saucedemo # only @saucedemo scenarios
npm run test:api      # only the API suite (needs api-server running, see below)
npm run report        # opens the last HTML report
```

`playwright-bdd` transforms `.feature` files into Playwright specs inside `.features-gen/` (generated folder, ignored by git) before running `playwright test`. API specs get their own Playwright project (`api`, no browser) so they don't run needlessly 3 times across chromium/firefox/webkit.

## Executive report (`report/`)

The Playwright and Cucumber reports are built for an engineer (stack traces, selectors, traces). For someone non-technical who just needs to know "is everything OK?", there's a separate report, with none of that:

```bash
npm test              # (or npm run test:saucedemo / test:demoqa) generates test-results/results.json
npm run report:exec   # reads that JSON and generates executive-report/index.html
```

Shows pass rate, pass rate by area (DemoQA/SauceDemo/API) and by browser, and — if there are failures — a plain-language list (no code, no stack traces). In CI it's generated and uploaded as an artifact on every run, even if there were failures.

## How to add a new scenario

1. Write the `.feature` in `features/<site>/...feature` with the steps in Gherkin.
2. If the step is new, add it in `steps/<site>/...steps.ts`, delegating DOM interaction to a Page Object (don't use selectors directly in the step).
3. If the flow needs a new page, create the Page Object in `pages/<site>/` extending `BasePage`, and expose its fixture in `support/fixtures.ts`.

## API tests (`api-server/`, `clients/ApiClient.ts`)

The project only had UI tests until now. Rather than point API tests at a third-party API, there's a **small Express + TypeScript backend living in this repo** (`api-server/`) — free forever (no cloud dependency), and it can grow (more endpoints/services) in ways a third-party API wouldn't allow.

It exposes an in-memory `tasks` resource behind a login:

- `POST /auth/login` — hardcoded demo credentials (`admin` / `admin123`), returns a bearer token or 401.
- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:id` — all require `Authorization: Bearer <token>` (401 if missing/invalid), 400 on a missing required field, 404 on an unknown id.

The store resets whenever the process restarts — that's fine for a test target, and it's the extension point for a real DB (SQLite/Postgres) later without the routes changing shape.

### Running it locally (without Docker)

```bash
npm run api:install   # once, installs api-server's own dependencies
npm run api:dev       # starts it on http://localhost:3001
npm run test:api      # in another terminal
```

### How the tests are structured

`clients/ApiClient.ts` wraps Playwright's `APIRequestContext` — the API-testing equivalent of a Page Object, so `steps/api/tasks.steps.ts` reads as short sentences instead of raw `request.*` calls. The `apiClient` fixture (`support/fixtures.ts`) builds its own `APIRequestContext` pointed at `API_BASE_URL` (default `http://localhost:3001`), independent from the UI suite's `baseURL` (demoqa.com). `features/api/tasks.feature` covers the full CRUD happy path plus the classic negative matrix (401 without a token, 400 on a missing title, 404 on an unknown id).

## Docker

```bash
npm run docker:build   # docker compose build
npm run docker:test    # docker compose run --rm tests (starts api-server too, runs the full suite)
```

Two images:
- **`Dockerfile`** (root) — the test runner, based on the official `mcr.microsoft.com/playwright` image (pinned to match the installed `@playwright/test` version — bump both together when upgrading).
- **`api-server/Dockerfile`** — lightweight `node:20-alpine`, no browsers, just Express + tsx.

`docker-compose.yml` wires them together: the `tests` service waits for `api` to report healthy, reaches it at `http://api:3001` over the compose network, and writes reports back to the host via volumes (`playwright-report/`, `cucumber-report/`, `executive-report/`, `test-results/`) so they're inspectable without going into the container.

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

## Self-healing locators (`ai/healLocators.ts`)

A different failure mode than the one above: not a *missing* step, but an *existing, already-passing* scenario whose locator stopped matching the real DOM (the site renamed an id, restructured a form, etc.). When the CI run in `.github/workflows/playwright.yml` fails, a self-healing pass triages the failures and — for the ones it's actually confident about — opens a PR with a grounded fix. It never pushes to `main` directly and never auto-merges.

**Planner → Generator → Healer, applied to a repair instead of a generation:**

1. **Planner** (`ai/locatorFailure.ts#classifyFailure`): reads the full Playwright error and checks whether it's genuinely a locator-not-found/timeout failure (Playwright's own error echoes the locator back, e.g. `waiting for locator('#user-name')`). Anything else — a content assertion, a network error, an application bug — is left completely untouched. This is the guardrail against the risk the term "self-healing" usually raises: it only ever acts on "this selector doesn't resolve," never on "this test's expectations don't match reality."
2. The broken locator string is mapped back to its Page Object field (`ai/pageObjectCatalog.ts#findLocatorField` — real Page Objects here assign locators once as constructor fields, e.g. `this.username = page.locator('#user-name');`, so this is a source grep, not a guess).
3. **Generator (probe)**: the same DOM-capture mechanism as `--implement-missing` (`ai/domProbe.ts`, `ai/probeRuntime.ts`) is reused, but inserted into the *existing* method that uses the broken field (`ai/codeInsertion.ts#insertProbeAtMethodStart`) instead of a brand-new stub. The scenario is re-run once to capture the real DOM at the point of failure, then the file is restored to its original content before anything else happens.
4. **Generator (fix)**: one Claude call, constrained to picking a replacement *literally* from that real digest (or explicitly saying `NONE` if nothing plausible matches) — verified again with the same `groundGeneratedCode` check used elsewhere, so an invented selector can't slip through. `NONE`, or a replacement that fails grounding, means the healer stops here: this reads as a real regression, not a rename.
5. **Healer**: `ai/codeInsertion.ts#replaceConstructorAssignment` applies the fix, the scenario is re-run once more to verify it actually passes now. If it doesn't, the file is reverted and nothing is proposed — same "never leave an unverified change live" discipline as `--implement-missing`.
6. Only if at least one locator was verified does `peter-evans/create-pull-request` open (or update) a PR on a single `ai/self-heal` branch, with the original failure text in the body and an explicit "review before merging" note.

**Explicit non-goals:** doesn't run on `pull_request` events (only `push` to `main` / manual dispatch — avoids granting write-capable tokens to PR-triggered runs), doesn't touch the `api` suite (locators are a UI concept), and only considers the `chromium` project (cross-browser validation is `npm test`'s job).

**Testing it locally** (there's no safe way to trigger a real breakage in CI on demand): deliberately break a real locator, e.g. in `pages/saucedemo/LoginPage.ts` change `page.locator('#user-name')` to a nonexistent id, run `npm test` (or just the affected suite) to produce a real failing `test-results/results.json`, then:
```bash
npm run heal:locators
```
Confirm it proposes the real selector back, applies it, and the re-run passes. Revert the deliberate breakage afterward — don't commit it.

## Lambda + API Gateway (`infra/`)

The plain generator (no `--implement-missing`) is also deployed as a serverless AI microservice — the concrete "cloud-native AI application" piece:

- `POST /generate` with `{ "description": "...", "suite": "demoqa" | "saucedemo" }` returns `{ "featureText": "...", "missingSteps": [...] }`. Same anti-hallucination grounding as the CLI, no filesystem writes — `ai/generateScenarioCore.ts` holds the shared logic so it isn't duplicated between the CLI and the Lambda handler.
- `GET /catalog?suite=demoqa|saucedemo` returns `{ "suite": "...", "steps": [{ "keyword", "pattern", "sourceFile" }, ...] }` — the same live step catalog `/generate` grounds against (`ai/stepCatalog.ts`), so a client can inspect what already exists before asking for a new scenario. Read-only, no Claude call, so it's fast and free to call.

**Why `--implement-missing` stays out of Lambda:** it needs a real, multi-minute browser session — the wrong execution model for a request/response function. It keeps living exactly where it already does (CLI / CI / Docker).

### Architecture

- **IaC**: AWS CDK in TypeScript (`infra/lib/generate-scenario-stack.ts`) — a Lambda function (Node 20) behind a REST API Gateway, `POST /generate` and `GET /catalog` both requiring an API key, plus a usage plan (rate limit, burst limit, monthly quota) shared across both.
- **Build** (`infra/build.mjs`): esbuild-bundles `infra/lambda/handler.ts` into `infra/dist/handler.js`, and copies `steps/` and `features/` into `infra/dist/` — `ai/stepCatalog.ts` reads those as real files at runtime (same live-catalog mechanism as everywhere else in this project), they just need to physically exist in the deployed package.
- **Deploy**: GitHub Actions (`.github/workflows/deploy-lambda.yml`), authenticating to AWS via **OIDC** (no long-lived AWS keys stored in GitHub) — same pattern as the Docker CI pipeline, applied to a cloud deploy this time.
- **Testing the live endpoint**: every deploy ends by running a real Playwright/Gherkin suite (`features/api/lambda-generate.feature`, tagged `@lambda`) against the just-deployed URL — happy path, input validation (missing description, invalid suite), and the API-key rejection path (403 from API Gateway itself). Same tooling as the rest of the project's tests, via a `LambdaClient` (`clients/LambdaClient.ts`) that mirrors the existing `ApiClient` pattern used for `api-server/`. Run it yourself against a live deployment with:
  ```bash
  LAMBDA_API_URL=https://<id>.execute-api.us-east-1.amazonaws.com/prod/ \
  LAMBDA_API_KEY=<key value> \
  npm run test:lambda
  ```

### Local build (no AWS needed)

```bash
cd infra
npm install
npm run synth   # builds the bundle, then `cdk synth` — validates the whole stack, no AWS credentials required
```

### One-time AWS setup (only needed once, done by whoever owns the AWS account)

1. Create the GitHub OIDC identity provider in IAM (skip if one already exists from another project):
   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com \
     --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
   ```
2. Create an IAM role trusting that provider, scoped to this repo's `main` branch only, and attach a policy broad enough for CDK to manage its own resources (`AdministratorAccess` is the pragmatic choice for a personal/demo account — the trust policy below, not the permissions, is what actually limits who can assume it):
   ```bash
   cat > trust-policy.json <<'JSON'
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": {
           "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
           "token.actions.githubusercontent.com:sub": "repo:wetelleza/playwright-bdd-pom:ref:refs/heads/main"
         }
       }
     }]
   }
   JSON
   aws iam create-role --role-name github-deploy-playwright-bdd-pom --assume-role-policy-document file://trust-policy.json
   aws iam attach-role-policy --role-name github-deploy-playwright-bdd-pom --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   ```
   **Note:** some GitHub accounts issue OIDC tokens whose `sub` claim embeds the numeric owner/repo IDs (e.g. `repo:org@123/repo@456:ref:refs/heads/main`) instead of the plain-name form above. If `AssumeRoleWithWebIdentity` fails with `Not authorized` even though the trust policy looks right, add a debug step to the workflow that decodes the actual token and prints its claims before assuming any role, then update the `sub` condition to match exactly what GitHub sent:
   ```bash
   TOKEN=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r '.value')
   node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url').toString('utf8')))" "$TOKEN"
   ```
3. Add two repository secrets (Settings → Secrets and variables → Actions): `AWS_DEPLOY_ROLE_ARN` (the role's ARN from step 2) and `ANTHROPIC_API_KEY` (the same Claude key already used locally).
4. Push to `main` (touching `infra/**` or `ai/**`), or run the workflow manually — it builds, deploys, and smoke-tests the live endpoint.

## CI (GitHub Actions)

The [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) workflow runs on every push/PR to `main`:

1. Installs dependencies (`npm ci`) — needed on the runner for the report-generation step below, which doesn't need a browser so it doesn't need to run inside a container.
2. Builds the Docker images (`docker compose build`).
3. Runs the whole suite — chromium/firefox/webkit + api — inside containers (`docker compose run --rm tests`), which starts `api-server` automatically. Same environment on every machine; sidesteps host-specific issues entirely (this is the generalized fix for a couple of Windows-only bugs hit during local development: an `npx`/`spawnSync` quirk and a missing system DLL for Webkit).
4. Stops the containers.
5. Generates and uploads the executive report as an artifact, even if there were failures (reports land on the host via the volumes in `docker-compose.yml`).
6. Uploads the Playwright HTML report and the Cucumber report as artifacts.

## Notes on the complex widgets covered

- **Date picker** (`practice-form.feature`): navigates month/year instead of typing free text.
- **Autocomplete** (`subjectsInput`): types and selects from a suggestion list that renders dynamically.
- **react-select** (State/City): not native `<select>` elements; requires click + click on the rendered option.
- **Native dialogs** (`alerts-and-modals.feature`): `alert`, `confirm`, `prompt` are handled as events (`page.on('dialog')`), not DOM elements — the listener is registered before triggering the action.
- **React table with CRUD** (`web-tables.feature`): create/edit/delete via modal, search with dynamic row filtering.
- **File upload/download** (`upload-download.feature`): upload via a native `<input type="file">` (in-memory buffer, no fixture file needed on disk); download from an anchor whose `href` is a `data:` URI, not a real URL — Playwright still intercepts it as a normal `download` event.
- **Native form validation** (`practice-form.feature`, required-field/email scenarios): the site relies on the browser's own HTML5 constraint validation (`required`/`pattern` attributes), not a custom CSS class — a failing field matches the `:invalid` pseudo-class, checked via `locator.evaluate(el => el.matches(':invalid'))`.
- **Hierarchical checkbox tree** (`checkboxes.feature`): built with `rc-tree` — selecting a parent node's checkbox cascades the selection to every descendant, even ones never expanded/rendered in the DOM.
