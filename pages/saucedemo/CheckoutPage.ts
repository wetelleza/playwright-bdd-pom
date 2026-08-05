import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

export interface CheckoutInfo {
  firstName: string;
  lastName: string;
  postalCode: string;
}

export class CheckoutPage extends BasePage {
  private readonly checkoutButton: Locator;
  private readonly firstName: Locator;
  private readonly lastName: Locator;
  private readonly postalCode: Locator;
  private readonly continueButton: Locator;
  private readonly finishButton: Locator;
  private readonly summaryTotal: Locator;
  private readonly completeHeader: Locator;

  constructor(page: Page) {
    super(page);
    this.checkoutButton = page.locator('[data-test="checkout"]');
    this.firstName = page.locator('#first-name');
    this.lastName = page.locator('#last-name');
    this.postalCode = page.locator('#postal-code');
    this.continueButton = page.locator('[data-test="continue"]');
    this.finishButton = page.locator('[data-test="finish"]');
    this.summaryTotal = page.locator('.summary_total_label');
    this.completeHeader = page.locator('.complete-header');
  }

  async startCheckout(): Promise<void> {
    await this.checkoutButton.click();
  }

  async fillInfo(info: CheckoutInfo): Promise<void> {
    await this.firstName.fill(info.firstName);
    await this.lastName.fill(info.lastName);
    await this.postalCode.fill(info.postalCode);
    await this.continueButton.click();
  }

  async totalText(): Promise<string | null> {
    return this.summaryTotal.textContent();
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  async isOrderComplete(): Promise<boolean> {
    return this.completeHeader.isVisible();
  }
}
