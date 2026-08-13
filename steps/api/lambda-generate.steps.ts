import { expect } from '@playwright/test';
import { When, Then } from '../../support/fixtures';

When('the client generates a scenario for {string} in suite {string}', async ({ lambdaClient }, description: string, suite: string) => {
  await lambdaClient.generate(description, suite);
});

When('the client generates a scenario without a description in suite {string}', async ({ lambdaClient }, suite: string) => {
  await lambdaClient.generate(undefined, suite);
});

When('the client generates a scenario without an API key', async ({ lambdaClient }) => {
  await lambdaClient.generate('Verify the page title is visible', 'demoqa', { withApiKey: false });
});

When('the client fetches the step catalog for suite {string}', async ({ lambdaClient }, suite: string) => {
  await lambdaClient.catalog(suite);
});

When('the client fetches the step catalog without a suite', async ({ lambdaClient }) => {
  await lambdaClient.catalog();
});

Then('the lambda response status is {int}', async ({ lambdaClient }, status: number) => {
  expect(lambdaClient.lastStatus()).toBe(status);
});

Then('the response has a non-empty feature text', async ({ lambdaClient }) => {
  const body = lambdaClient.lastBody<{ featureText?: string }>();
  expect(body.featureText?.length ?? 0).toBeGreaterThan(0);
});

Then('the response lists the missing steps as an array', async ({ lambdaClient }) => {
  const body = lambdaClient.lastBody<{ missingSteps?: unknown }>();
  expect(Array.isArray(body.missingSteps)).toBe(true);
});

Then('the catalog has at least {int} step', async ({ lambdaClient }, count: number) => {
  const body = lambdaClient.lastBody<{ steps?: unknown[] }>();
  expect(Array.isArray(body.steps)).toBe(true);
  expect(body.steps!.length).toBeGreaterThanOrEqual(count);
});
