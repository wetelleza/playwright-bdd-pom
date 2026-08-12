import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

interface DownloadInfo {
  filename: string;
  downloadedToDisk: boolean;
}

/** https://demoqa.com/upload-download — native file input upload and a download triggered by
 *  clicking an anchor (its href is a data: URI, not a real URL — Playwright still intercepts
 *  it as a normal download event). */
export class UploadDownloadPage extends BasePage {
  private readonly uploadInput: Locator;
  private readonly uploadedFilePath: Locator;
  private readonly downloadButton: Locator;

  private lastDownload: DownloadInfo | null = null;

  constructor(page: Page) {
    super(page);
    this.uploadInput = page.locator('#uploadFile');
    this.uploadedFilePath = page.locator('#uploadedFilePath');
    this.downloadButton = page.locator('#downloadButton');
  }

  async open(): Promise<void> {
    await this.goto('/upload-download');
  }

  async uploadFile(fileName: string, content = 'sample content for an automated upload test'): Promise<void> {
    await this.uploadInput.setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(content) });
  }

  /** The browser always prefixes the shown path with C:\fakepath\ for security, regardless of the real OS. */
  async uploadedFileName(): Promise<string | null> {
    const text = await this.uploadedFilePath.textContent();
    return text ? text.replace(/^C:\\fakepath\\/, '') : text;
  }

  async downloadFile(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadButton.click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    this.lastDownload = { filename: download.suggestedFilename(), downloadedToDisk: !!savedPath };
  }

  lastDownloadInfo(): DownloadInfo {
    if (!this.lastDownload) throw new Error('No download was triggered yet in this scenario');
    return this.lastDownload;
  }
}
