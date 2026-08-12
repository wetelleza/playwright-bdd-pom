import { expect } from '@playwright/test';
import { DataTable } from 'playwright-bdd';
import { Given, When, Then } from '../../support/fixtures';
import type { RecordData } from '../../pages/demoqa/WebTablesPage';

Given('the user opens the web tables page', async ({ webTablesPage }) => {
  await webTablesPage.open();
});

Given('a record with email {string} exists', async ({ webTablesPage }, email: string) => {
  await webTablesPage.addRecord({
    firstName: 'Test',
    lastName: 'User',
    email,
    age: '30',
    salary: '5000',
    department: 'QA',
  });
});

When('adds a record with the following data', async ({ webTablesPage }, table: DataTable) => {
  const record = table.hashes()[0] as unknown as RecordData;
  await webTablesPage.addRecord(record);
});

When('searches for {string}', async ({ webTablesPage }, term: string) => {
  await webTablesPage.search(term);
});

When(
  'edits the record for {string} changing the salary to {string}',
  async ({ webTablesPage }, email: string, salary: string) => {
    await webTablesPage.editRow(email, { salary });
  },
);

When('deletes the record for {string}', async ({ webTablesPage }, email: string) => {
  await webTablesPage.deleteRow(email);
});

Then('the row with email {string} is visible', async ({ webTablesPage }, email: string) => {
  const row = await webTablesPage.rowByEmail(email);
  await expect(row).toBeVisible();
});

Then('the row with email {string} contains salary {string}', async ({ webTablesPage }, email: string, salary: string) => {
  const row = await webTablesPage.rowByEmail(email);
  await expect(row).toContainText(salary);
});

Then('no rows are visible', async ({ webTablesPage }) => {
  expect(await webTablesPage.visibleRowCount()).toBe(0);
});
