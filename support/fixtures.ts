import { test as base, createBdd } from 'playwright-bdd';
import { PracticeFormPage } from '../pages/demoqa/PracticeFormPage';
import { WebTablesPage } from '../pages/demoqa/WebTablesPage';
import { AlertsModalsPage } from '../pages/demoqa/AlertsModalsPage';
import { LoginPage } from '../pages/saucedemo/LoginPage';
import { InventoryPage } from '../pages/saucedemo/InventoryPage';
import { CheckoutPage } from '../pages/saucedemo/CheckoutPage';

interface PageObjectFixtures {
  practiceFormPage: PracticeFormPage;
  webTablesPage: WebTablesPage;
  alertsModalsPage: AlertsModalsPage;
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  checkoutPage: CheckoutPage;
}

/** Each fixture instantiates its Page Object on demand: steps only ask for what they use. */
export const test = base.extend<PageObjectFixtures>({
  practiceFormPage: async ({ page }, use) => use(new PracticeFormPage(page)),
  webTablesPage: async ({ page }, use) => use(new WebTablesPage(page)),
  alertsModalsPage: async ({ page }, use) => use(new AlertsModalsPage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  inventoryPage: async ({ page }, use) => use(new InventoryPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
});

export const { Given, When, Then } = createBdd(test);
