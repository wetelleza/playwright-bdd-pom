import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

/** https://demoqa.com/checkbox — hierarchical expandable tree (rc-tree library, not the
 *  react-checkbox-tree "rct-" classes you'd expect from the name): selecting a parent's
 *  checkbox cascades the selection to every descendant, even ones never expanded/rendered. */
export class CheckboxPage extends BasePage {
  private readonly result: Locator;

  constructor(page: Page) {
    super(page);
    this.result = page.locator('#result');
  }

  async open(): Promise<void> {
    await this.goto('/checkbox');
  }

  private nodeRow(nodeName: string): Locator {
    return this.page.locator('.rc-tree-treenode').filter({ has: this.page.locator('.rc-tree-title', { hasText: nodeName }) });
  }

  async expand(nodeName: string): Promise<void> {
    await this.nodeRow(nodeName).locator('.rc-tree-switcher').click();
  }

  async select(nodeName: string): Promise<void> {
    await this.page.locator(`.rc-tree-checkbox[aria-label="Select ${nodeName}"]`).click();
  }

  /** The result panel lowercases every node name (e.g. "Home" -> "home"). */
  async selectedItems(): Promise<string[]> {
    return this.result.locator('.text-success').allTextContents();
  }
}
