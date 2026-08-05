import { expect } from '@playwright/test';
import { DataTable } from 'playwright-bdd';
import { Given, When, Then } from '../../support/fixtures';

Given('que el usuario abre el formulario de practica', async ({ practiceFormPage }) => {
  await practiceFormPage.open();
});

When('completa sus datos personales', async ({ practiceFormPage }, table: DataTable) => {
  const row = table.hashes()[0];
  await practiceFormPage.fillPersonalInfo({
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    mobile: row.mobile,
  });
});

When('selecciona el genero {string}', async ({ practiceFormPage }, gender: 'Male' | 'Female' | 'Other') => {
  await practiceFormPage.selectGender(gender);
});

When('selecciona los hobbies {string} y {string}', async ({ practiceFormPage }, hobbyA: string, hobbyB: string) => {
  await practiceFormPage.selectHobbies([hobbyA, hobbyB] as Array<'Sports' | 'Reading' | 'Music'>);
});

When(
  'selecciona la fecha de nacimiento {string} {string} {string}',
  async ({ practiceFormPage }, day: string, month: string, year: string) => {
    await practiceFormPage.setDateOfBirth({ day, month, year });
  },
);

When('agrega la materia {string}', async ({ practiceFormPage }, subject: string) => {
  await practiceFormPage.addSubjects([subject]);
});

When('completa la direccion actual {string}', async ({ practiceFormPage }, address: string) => {
  await practiceFormPage.fillAddress({ currentAddress: address });
});

When('selecciona el estado {string} y la ciudad {string}', async ({ practiceFormPage }, state: string, city: string) => {
  await practiceFormPage.selectStateAndCity(state, city);
});

When('envia el formulario', async ({ practiceFormPage }) => {
  await practiceFormPage.submit();
});

Then('se muestra el modal de confirmacion', async ({ practiceFormPage }) => {
  expect(await practiceFormPage.isConfirmationVisible()).toBe(true);
});

Then('el modal muestra {string} con valor {string}', async ({ practiceFormPage }, label: string, value: string) => {
  const actual = await practiceFormPage.getModalRowValue(label);
  expect(actual).toBe(value);
});
