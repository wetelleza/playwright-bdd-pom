import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('que el usuario esta en la pagina de login de SauceDemo', async ({ loginPage }) => {
  await loginPage.open();
});

When('inicia sesion con usuario {string} y password {string}', async ({ loginPage }, user: string, password: string) => {
  await loginPage.login(user, password);
});

Then('el usuario llega al listado de productos', async ({ page }) => {
  await expect(page).toHaveURL(/inventory\.html/);
});

Then('se muestra el error {string}', async ({ loginPage }, expected: string) => {
  await expect.poll(() => loginPage.errorText()).toContain(expected);
});
