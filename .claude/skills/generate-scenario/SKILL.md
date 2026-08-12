---
name: generate-scenario
description: Generates a new Gherkin scenario (.feature) from a natural-language description, reusing only the steps already implemented in steps/**/*.steps.ts. Use when the user asks to create/add a new test case or scenario by describing it in plain English, instead of writing the .feature by hand.
---

This project has a scenario generator with anti-hallucination grounding in `ai/generateScenario.ts`: it builds a prompt with the real catalog of existing steps, asks Claude to generate the Gherkin reusing only those steps, and programmatically validates the result with `@cucumber/cucumber-expressions` before writing the file. Don't duplicate that logic here — this skill is a thin wrapper that invokes it.

## Steps

1. From the user's request, identify:
   - `description`: the request in natural language, as is (in English).
   - `suite`: `demoqa` or `saucedemo`. If the user doesn't say it explicitly, infer it from the content (forms/tables/alerts → `demoqa`; login/cart/checkout → `saucedemo`). If ambiguous, ask the user instead of assuming.

2. Confirm `ANTHROPIC_API_KEY` exists in the environment or in `.env` (see `.env.example`). If missing, tell the user and stop — don't proceed without the key.

3. Decide whether to add `--implement-missing`: if the user explicitly asked for missing pieces to be implemented (e.g. "and if a new step is needed, write it"), add it. If they only asked to generate the scenario, don't add it on your own — it's a much heavier run (spins up real browsers and runs the scenario several times against the live site) and the user should ask for it on purpose.

4. Run the generator with Bash:
   ```
   npm run ai:generate -- "<description>" --suite <suite> [--implement-missing]
   ```
   If you used `--implement-missing`, the run can take a while (several attempts with a real browser per missing step) — warn the user it may take time before launching it.

5. Read the `.feature` the command reported having created (under `features/<suite>/`).

6. Summarize for the user:
   - Which scenario was generated (title + main steps).
   - If you ran with `--implement-missing`, tell them what was actually implemented (new method in which Page Object, new step in `steps/<suite>/ai-generated.steps.ts`) and what was left unresolved after the retries.
   - If the file has a `# Missing steps` block at the end, show it explicitly and clarify that those actions weren't included in the scenario because no step covers them (or because implementing them was attempted and couldn't be verified) — the user decides what to do before enabling the scenario.
   - Remember the file was marked with the `@ai-generated` tag and the header comment, so it's worth reviewing before merging (it's not meant to auto-approve itself). The same goes for any method marked `// AI WARNING` in a Page Object: it wasn't verified automatically, it needs manual review.

Don't hand-edit the generated `.feature` as part of this skill — if something went wrong (missing steps, odd wording), the fix is to re-run the generator with a more precise description, or ask the user to adjust the request.
