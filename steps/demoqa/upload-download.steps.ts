import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

Given('the user opens the upload and download page', async ({ uploadDownloadPage }) => {
  await uploadDownloadPage.open();
});

When('uploads a file named {string}', async ({ uploadDownloadPage }, fileName: string) => {
  await uploadDownloadPage.uploadFile(fileName);
});

Then('the uploaded file name shows {string}', async ({ uploadDownloadPage }, fileName: string) => {
  expect(await uploadDownloadPage.uploadedFileName()).toBe(fileName);
});

When('downloads the sample file', async ({ uploadDownloadPage }) => {
  await uploadDownloadPage.downloadFile();
});

Then('the file {string} is saved to disk', async ({ uploadDownloadPage }, fileName: string) => {
  const info = uploadDownloadPage.lastDownloadInfo();
  expect(info.filename).toBe(fileName);
  expect(info.downloadedToDisk).toBe(true);
});
