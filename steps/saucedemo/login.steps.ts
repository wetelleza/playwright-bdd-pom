import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('the user is on the SauceDemo login page', async ({ loginPage }) => {
  await loginPage.open();
});

When('logs in with user {string} and password {string}', async ({ loginPage }, user: string, password: string) => {
  await loginPage.login(user, password);
});

Then('the user lands on the products list', async ({ page }) => {
  await expect(page).toHaveURL(/inventory\.html/);
});

Then('the error {string} is shown', async ({ loginPage }, expected: string) => {
  await expect.poll(() => loginPage.errorText()).toContain(expected);
});
