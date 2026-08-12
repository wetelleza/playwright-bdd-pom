import { expect } from '@playwright/test';
import { DataTable } from 'playwright-bdd';
import { Given, When, Then } from '../../support/fixtures';

Given('the user opens the practice form', async ({ practiceFormPage }) => {
  await practiceFormPage.open();
});

When('the user fills in their personal details', async ({ practiceFormPage }, table: DataTable) => {
  const row = table.hashes()[0];
  await practiceFormPage.fillPersonalInfo({
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    mobile: row.mobile,
  });
});

When('selects gender {string}', async ({ practiceFormPage }, gender: 'Male' | 'Female' | 'Other') => {
  await practiceFormPage.selectGender(gender);
});

When('selects hobbies {string} and {string}', async ({ practiceFormPage }, hobbyA: string, hobbyB: string) => {
  await practiceFormPage.selectHobbies([hobbyA, hobbyB] as Array<'Sports' | 'Reading' | 'Music'>);
});

When(
  'selects date of birth {string} {string} {string}',
  async ({ practiceFormPage }, day: string, month: string, year: string) => {
    await practiceFormPage.setDateOfBirth({ day, month, year });
  },
);

When('adds subject {string}', async ({ practiceFormPage }, subject: string) => {
  await practiceFormPage.addSubjects([subject]);
});

When('fills in current address {string}', async ({ practiceFormPage }, address: string) => {
  await practiceFormPage.fillAddress({ currentAddress: address });
});

When('selects state {string} and city {string}', async ({ practiceFormPage }, state: string, city: string) => {
  await practiceFormPage.selectStateAndCity(state, city);
});

When('submits the form', async ({ practiceFormPage }) => {
  await practiceFormPage.submit();
});

Then('the confirmation modal is shown', async ({ practiceFormPage }) => {
  expect(await practiceFormPage.isConfirmationVisible()).toBe(true);
});

Then('the modal shows {string} with value {string}', async ({ practiceFormPage }, label: string, value: string) => {
  const actual = await practiceFormPage.getModalRowValue(label);
  expect(actual).toBe(value);
});

Then('the {string} field is marked invalid', async ({ practiceFormPage }, field: string) => {
  expect(await practiceFormPage.hasValidationError(field as 'firstName' | 'lastName' | 'email' | 'mobile')).toBe(true);
});
