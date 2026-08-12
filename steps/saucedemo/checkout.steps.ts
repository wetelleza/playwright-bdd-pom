import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

When('adds {string} to the cart', async ({ inventoryPage }, product: string) => {
  await inventoryPage.addToCartByName(product);
});

When('removes {string} from the cart', async ({ inventoryPage }, product: string) => {
  await inventoryPage.removeFromCartByName(product);
});

Then('the cart counter shows {string}', async ({ inventoryPage }, expected: string) => {
  expect(await inventoryPage.cartCount()).toBe(Number(expected));
});

When('goes to the cart and proceeds to checkout', async ({ inventoryPage, checkoutPage }) => {
  await inventoryPage.goToCart();
  await checkoutPage.startCheckout();
});

When(
  'fills in shipping details {string} {string} {string}',
  async ({ checkoutPage }, firstName: string, lastName: string, postalCode: string) => {
    await checkoutPage.fillInfo({ firstName, lastName, postalCode });
  },
);

Then('the summary includes a total greater than {string}', async ({ checkoutPage }, min: string) => {
  const total = await checkoutPage.totalText();
  const amount = Number(total?.replace(/[^0-9.]/g, ''));
  expect(amount).toBeGreaterThan(Number(min));
});

When('finishes the purchase', async ({ checkoutPage }) => {
  await checkoutPage.finish();
});

Then('the order completes successfully', async ({ checkoutPage }) => {
  expect(await checkoutPage.isOrderComplete()).toBe(true);
});

Then('the shipping error {string} is shown', async ({ checkoutPage }, expected: string) => {
  await expect.poll(() => checkoutPage.errorText()).toContain(expected);
});

When('sorts the products by {string}', async ({ inventoryPage }, option: string) => {
  const map: Record<string, 'az' | 'za' | 'lohi' | 'hilo'> = {
    'Name (A to Z)': 'az',
    'Name (Z to A)': 'za',
    'Price (low to high)': 'lohi',
    'Price (high to low)': 'hilo',
  };
  await inventoryPage.sortBy(map[option]);
});

Then('the prices end up sorted from lowest to highest', async ({ inventoryPage }) => {
  const prices = await inventoryPage.itemPricesList();
  const sorted = [...prices].sort((a, b) => a - b);
  expect(prices).toEqual(sorted);
});
