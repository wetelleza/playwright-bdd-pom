import { test as base, createBdd } from 'playwright-bdd';
import { PracticeFormPage } from '../pages/demoqa/PracticeFormPage';
import { WebTablesPage } from '../pages/demoqa/WebTablesPage';
import { AlertsModalsPage } from '../pages/demoqa/AlertsModalsPage';
import { LoginPage } from '../pages/saucedemo/LoginPage';
import { InventoryPage } from '../pages/saucedemo/InventoryPage';
import { CheckoutPage } from '../pages/saucedemo/CheckoutPage';
import { UploadDownloadPage } from '../pages/demoqa/UploadDownloadPage';
import { CheckboxPage } from '../pages/demoqa/CheckboxPage';
import { ApiClient } from '../clients/ApiClient';
import { LambdaClient } from '../clients/LambdaClient';

interface PageObjectFixtures {
  practiceFormPage: PracticeFormPage;
  webTablesPage: WebTablesPage;
  alertsModalsPage: AlertsModalsPage;
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  checkoutPage: CheckoutPage;
  uploadDownloadPage: UploadDownloadPage;
  checkboxPage: CheckboxPage;
  apiClient: ApiClient;
  lambdaClient: LambdaClient;
}

/** Each fixture instantiates its Page Object on demand: steps only ask for what they use. */
export const test = base.extend<PageObjectFixtures>({
  practiceFormPage: async ({ page }, use) => use(new PracticeFormPage(page)),
  webTablesPage: async ({ page }, use) => use(new WebTablesPage(page)),
  alertsModalsPage: async ({ page }, use) => use(new AlertsModalsPage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  inventoryPage: async ({ page }, use) => use(new InventoryPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  uploadDownloadPage: async ({ page }, use) => use(new UploadDownloadPage(page)),
  checkboxPage: async ({ page }, use) => use(new CheckboxPage(page)),
  // Independent APIRequestContext, not tied to the UI baseURL (demoqa.com): API tests hit the
  // local tasks backend instead, so they get their own base URL via API_BASE_URL.
  apiClient: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL ?? 'http://localhost:3001' });
    await use(new ApiClient(context));
    await context.dispose();
  },
  // Points at the deployed API Gateway stage (infra/), not the local tasks backend — set
  // LAMBDA_API_URL/LAMBDA_API_KEY from `cdk deploy`'s outputs (see the deploy workflow).
  lambdaClient: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: process.env.LAMBDA_API_URL ?? 'http://localhost:3000/' });
    await use(new LambdaClient(context, process.env.LAMBDA_API_KEY ?? ''));
    await context.dispose();
  },
});

export const { Given, When, Then } = createBdd(test);
