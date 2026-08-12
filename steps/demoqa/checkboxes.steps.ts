import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('the user opens the checkboxes page', async ({ checkboxPage }) => {
  await checkboxPage.open();
});

When('expands the {string} node', async ({ checkboxPage }, nodeName: string) => {
  await checkboxPage.expand(nodeName);
});

When('selects the {string} node', async ({ checkboxPage }, nodeName: string) => {
  await checkboxPage.select(nodeName);
});

Then(
  'the selected items include {string}, {string}, {string} and {string}',
  async ({ checkboxPage }, a: string, b: string, c: string, d: string) => {
    const items = await checkboxPage.selectedItems();
    for (const item of [a, b, c, d]) expect(items).toContain(item);
  },
);
