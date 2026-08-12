import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('the client logs in with valid credentials', async ({ apiClient }) => {
  await apiClient.login('admin', 'admin123');
});

When('the client logs in with username {string} and password {string}', async ({ apiClient }, username: string, password: string) => {
  await apiClient.login(username, password);
});

When('creates a task titled {string}', async ({ apiClient }, title: string) => {
  await apiClient.createTask(title);
});

When('creates a task titled {string} without logging in', async ({ apiClient }, title: string) => {
  apiClient.clearToken();
  await apiClient.createTask(title);
});

When('creates a task without a title', async ({ apiClient }) => {
  await apiClient.createTask();
});

When('fetches the last created task', async ({ apiClient }) => {
  await apiClient.getLastCreatedTask();
});

When('fetches the task with id {string}', async ({ apiClient }, id: string) => {
  await apiClient.getTask(Number(id));
});

When('updates the last created task setting done to true', async ({ apiClient }) => {
  await apiClient.updateLastCreatedTask({ done: true });
});

When('deletes the last created task', async ({ apiClient }) => {
  await apiClient.deleteLastCreatedTask();
});

Then('the response status is {int}', async ({ apiClient }, status: number) => {
  expect(apiClient.lastStatus()).toBe(status);
});

Then('the last task title is {string}', async ({ apiClient }, title: string) => {
  expect(apiClient.lastBody<{ title?: string }>().title).toBe(title);
});

Then('the last task is marked done', async ({ apiClient }) => {
  expect(apiClient.lastBody<{ done?: boolean }>().done).toBe(true);
});
