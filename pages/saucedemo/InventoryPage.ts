import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';
import { captureProbe } from '../../ai/probeRuntime';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage extends BasePage {
  private readonly sortDropdown: Locator;
  private readonly cartBadge: Locator;
  private readonly cartLink: Locator;
  private readonly itemNames: Locator;
  private readonly itemPrices: Locator;

  constructor(page: Page) {
    super(page);
    this.sortDropdown = page.locator('[data-test="product-sort-container"]');
    this.cartBadge = page.locator('.shopping_cart_badge');
    this.cartLink = page.locator('.shopping_cart_link');
    this.itemNames = page.locator('.inventory_item_name');
    this.itemPrices = page.locator('.inventory_item_price');
  }

  async addToCartByName(name: string): Promise<void> {
    const item = this.page.locator('.inventory_item').filter({ hasText: name });
    await item.getByRole('button', { name: 'Add to cart' }).click();
  }

  async removeFromCartByName(name: string): Promise<void> {
    const item = this.page.locator('.inventory_item').filter({ hasText: name });
    await item.getByRole('button', { name: 'Remove' }).click();
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortDropdown.selectOption(option);
  }

  async itemNamesList(): Promise<string[]> {
    return this.itemNames.allTextContents();
  }

  async itemPricesList(): Promise<number[]> {
    const texts = await this.itemPrices.allTextContents();
    return texts.map((t) => Number(t.replace('$', '')));
  }

  async cartCount(): Promise<number> {
    if (!(await this.cartBadge.isVisible())) return 0;
    return Number(await this.cartBadge.textContent());
  }

  async goToCart(): Promise<void> {
    await this.cartLink.click();
  }

  async firstItemIsMostExpensive(): Promise<void> {
    const prices = await this.page.locator('[data-test="inventory-item-price"]').allTextContents();
    const numericPrices = prices.map((price) => parseFloat(price.replace('$', '')));
    const maxPrice = Math.max(...numericPrices);
    if (numericPrices[0] !== maxPrice) {
      throw new Error(`Expected first item price ${numericPrices[0]} to be the most expensive (${maxPrice})`);
    }
  }
}
