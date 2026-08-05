import { expect } from '@playwright/test';
import { DataTable } from 'playwright-bdd';
import { Given, When, Then } from '../../support/fixtures';
import type { RecordData } from '../../pages/demoqa/WebTablesPage';

Given('que el usuario abre la pagina de web tables', async ({ webTablesPage }) => {
  await webTablesPage.open();
});

Given('que existe un registro con email {string}', async ({ webTablesPage }, email: string) => {
  await webTablesPage.addRecord({
    firstName: 'Test',
    lastName: 'User',
    email,
    age: '30',
    salary: '5000',
    department: 'QA',
  });
});

When('agrega un registro con los siguientes datos', async ({ webTablesPage }, table: DataTable) => {
  const record = table.hashes()[0] as unknown as RecordData;
  await webTablesPage.addRecord(record);
});

When('busca {string}', async ({ webTablesPage }, term: string) => {
  await webTablesPage.search(term);
});

When(
  'edita el registro de {string} cambiando el salario a {string}',
  async ({ webTablesPage }, email: string, salary: string) => {
    await webTablesPage.editRow(email, { salary });
  },
);

When('borra el registro de {string}', async ({ webTablesPage }, email: string) => {
  await webTablesPage.deleteRow(email);
});

Then('la fila con email {string} es visible', async ({ webTablesPage }, email: string) => {
  const row = await webTablesPage.rowByEmail(email);
  await expect(row).toBeVisible();
});

Then('la fila con email {string} contiene el salario {string}', async ({ webTablesPage }, email: string, salary: string) => {
  const row = await webTablesPage.rowByEmail(email);
  await expect(row).toContainText(salary);
});

Then('no hay filas visibles', async ({ webTablesPage }) => {
  expect(await webTablesPage.visibleRowCount()).toBe(0);
});
