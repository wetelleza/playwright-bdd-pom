import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('que el usuario abre la pagina de alertas', async ({ alertsModalsPage }) => {
  await alertsModalsPage.open();
});

Given('que el usuario abre la pagina de modales', async ({ alertsModalsPage }) => {
  await alertsModalsPage.openModals();
});

When('dispara la alerta simple', async ({ alertsModalsPage }) => {
  await alertsModalsPage.triggerSimpleAlert();
});

When('dispara la alerta con temporizador', async ({ alertsModalsPage }) => {
  await alertsModalsPage.triggerTimerAlert();
});

Then('el mensaje de la alerta fue {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(alertsModalsPage.getLastDialogMessage()).toBe(expected);
});

When('responde el dialogo de confirmacion con {string}', async ({ alertsModalsPage }, respuesta: string) => {
  await alertsModalsPage.triggerConfirm(respuesta === 'aceptar');
});

Then('el resultado de la confirmacion es {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(await alertsModalsPage.confirmResultText()).toContain(expected);
});

When('responde el prompt con el texto {string}', async ({ alertsModalsPage }, text: string) => {
  await alertsModalsPage.triggerPrompt(text);
});

Then('el resultado del prompt es {string}', async ({ alertsModalsPage }, expected: string) => {
  expect(await alertsModalsPage.promptResultText()).toContain(expected);
});

When('abre el modal pequeno', async ({ alertsModalsPage }) => {
  await alertsModalsPage.openSmallModal();
});

When('cierra el modal', async ({ alertsModalsPage }) => {
  await alertsModalsPage.closeModal();
});

Then('el modal esta visible', async ({ alertsModalsPage }) => {
  expect(await alertsModalsPage.isModalVisible()).toBe(true);
});

Then('el modal ya no esta visible', async ({ alertsModalsPage }) => {
  expect(await alertsModalsPage.isModalVisible()).toBe(false);
});
