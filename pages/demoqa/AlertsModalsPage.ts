import type { Dialog, Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

/** https://demoqa.com/alertsWindows — native browser dialogs (alert/confirm/prompt) and bootstrap modals. */
export class AlertsModalsPage extends BasePage {
  private readonly alertButton: Locator;
  private readonly timerAlertButton: Locator;
  private readonly confirmButton: Locator;
  private readonly promptButton: Locator;
  private readonly confirmResult: Locator;
  private readonly promptResult: Locator;
  private readonly smallModalButton: Locator;
  private readonly largeModalButton: Locator;

  private lastDialogMessage = '';

  constructor(page: Page) {
    super(page);
    this.alertButton = page.locator('#alertButton');
    this.timerAlertButton = page.locator('#timerAlertButton');
    this.confirmButton = page.locator('#confirmButton');
    this.promptButton = page.locator('#promtButton');
    this.confirmResult = page.locator('#confirmResult');
    this.promptResult = page.locator('#promptResult');
    this.smallModalButton = page.locator('#showSmallModal');
    this.largeModalButton = page.locator('#showLargeModal');
  }

  async open(): Promise<void> {
    await this.goto('/alerts');
  }

  /** Registers the dialog handler BEFORE triggering the action: native dialogs are events, not DOM elements. */
  private async triggerDialog(trigger: () => Promise<void>, accept: boolean, promptText?: string): Promise<void> {
    const dialogPromise = new Promise<void>((resolve) => {
      this.page.once('dialog', async (dialog: Dialog) => {
        this.lastDialogMessage = dialog.message();
        if (promptText !== undefined) {
          await dialog.accept(promptText);
        } else if (accept) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
        resolve();
      });
    });
    await trigger();
    await dialogPromise;
  }

  async triggerSimpleAlert(): Promise<void> {
    await this.triggerDialog(() => this.alertButton.click(), true);
  }

  async triggerTimerAlert(): Promise<void> {
    await this.triggerDialog(() => this.timerAlertButton.click(), true);
  }

  async triggerConfirm(accept: boolean): Promise<void> {
    await this.triggerDialog(() => this.confirmButton.click(), accept);
  }

  async triggerPrompt(text: string): Promise<void> {
    await this.triggerDialog(() => this.promptButton.click(), true, text);
  }

  getLastDialogMessage(): string {
    return this.lastDialogMessage;
  }

  async confirmResultText(): Promise<string | null> {
    return this.confirmResult.textContent();
  }

  async promptResultText(): Promise<string | null> {
    return this.promptResult.textContent();
  }

  async openModals(): Promise<void> {
    await this.goto('/modal-dialogs');
  }

  async openSmallModal(): Promise<void> {
    await this.smallModalButton.click();
  }

  async openLargeModal(): Promise<void> {
    await this.largeModalButton.click();
  }

  async closeModal(): Promise<void> {
    await this.page.locator('.modal.show .btn-close').click();
  }

  async isModalVisible(): Promise<boolean> {
    return this.page.locator('.modal.show').isVisible();
  }
}
