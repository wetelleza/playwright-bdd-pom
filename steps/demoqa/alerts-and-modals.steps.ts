import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('the user opens the alerts page', async ({ alertsModalsPage }) => {
  await alertsModalsPage.open();
});

Given('the user opens the modals page', async ({ alertsModalsPage }) => {
  await alertsModalsPage.openModals();
});

When('triggers the simple alert', async ({ alertsModalsPage }) => {
  await alertsModalsPage.triggerSimpleAlert();
});

When('triggers the timed alert', async ({ alertsModalsPage }) => {
  await alertsModalsPage.triggerTimerAlert();
});

Then('the alert message was {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(alertsModalsPage.getLastDialogMessage()).toBe(expected);
});

When('responds to the confirmation dialog with {string}', async ({ alertsModalsPage }, answer: string) => {
  await alertsModalsPage.triggerConfirm(answer === 'accept');
});

Then('the confirmation result is {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(await alertsModalsPage.confirmResultText()).toContain(expected);
});

When('responds to the prompt with the text {string}', async ({ alertsModalsPage }, text: string) => {
  await alertsModalsPage.triggerPrompt(text);
});

Then('the prompt result is {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(await alertsModalsPage.promptResultText()).toContain(expected);
});

When('opens the small modal', async ({ alertsModalsPage }) => {
  await alertsModalsPage.openSmallModal();
});

When('closes the modal', async ({ alertsModalsPage }) => {
  await alertsModalsPage.closeModal();
});

Then('the modal is visible', async ({ alertsModalsPage }) => {
  expect(await alertsModalsPage.isModalVisible()).toBe(true);
});

Then('the modal is no longer visible', async ({ alertsModalsPage }) => {
  expect(await alertsModalsPage.isModalVisible()).toBe(false);
});
