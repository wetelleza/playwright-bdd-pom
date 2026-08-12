import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

export interface RecordData {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  salary: string;
  department: string;
}

/** https://demoqa.com/webtables — dynamic table with CRUD via modal, search and pagination. */
export class WebTablesPage extends BasePage {
  private readonly addButton: Locator;
  private readonly searchBox: Locator;
  private readonly rows: Locator;
  private readonly modal: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('#addNewRecordButton');
    this.searchBox = page.locator('#searchBox');
    this.rows = page.locator('table tbody tr');
    this.modal = page.locator('.modal-content');
  }

  async open(): Promise<void> {
    await this.goto('/webtables');
  }

  async addRecord(record: RecordData): Promise<void> {
    await this.addButton.click();
    await this.modal.locator('#firstName').fill(record.firstName);
    await this.modal.locator('#lastName').fill(record.lastName);
    await this.modal.locator('#userEmail').fill(record.email);
    await this.modal.locator('#age').fill(record.age);
    await this.modal.locator('#salary').fill(record.salary);
    await this.modal.locator('#department').fill(record.department);
    await this.modal.locator('#submit').click();
  }

  async search(term: string): Promise<void> {
    await this.searchBox.fill(term);
  }

  async editRow(email: string, updated: Partial<RecordData>): Promise<void> {
    const row = this.rows.filter({ hasText: email });
    await row.locator('[title="Edit"]').click();
    if (updated.firstName) await this.modal.locator('#firstName').fill(updated.firstName);
    if (updated.lastName) await this.modal.locator('#lastName').fill(updated.lastName);
    if (updated.age) await this.modal.locator('#age').fill(updated.age);
    if (updated.salary) await this.modal.locator('#salary').fill(updated.salary);
    if (updated.department) await this.modal.locator('#department').fill(updated.department);
    await this.modal.locator('#submit').click();
  }

  async deleteRow(email: string): Promise<void> {
    const row = this.rows.filter({ hasText: email });
    await row.locator('[title="Delete"]').click();
  }

  async visibleRowCount(): Promise<number> {
    const texts = await this.rows.allTextContents();
    return texts.filter((t) => t.trim().length > 0 && !t.includes('No rows found')).length;
  }

  async rowByEmail(email: string): Promise<Locator> {
    return this.rows.filter({ hasText: email });
  }
}
