import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

When('agrega {string} al carrito', async ({ inventoryPage }, product: string) => {
  await inventoryPage.addToCartByName(product);
});

When('quita {string} del carrito', async ({ inventoryPage }, product: string) => {
  await inventoryPage.removeFromCartByName(product);
});

Then('el contador del carrito muestra {string}', async ({ inventoryPage }, expected: string) => {
  expect(await inventoryPage.cartCount()).toBe(Number(expected));
});

When('va al carrito y procede al checkout', async ({ inventoryPage, checkoutPage }) => {
  await inventoryPage.goToCart();
  await checkoutPage.startCheckout();
});

When(
  'completa sus datos de envio {string} {string} {string}',
  async ({ checkoutPage }, firstName: string, lastName: string, postalCode: string) => {
    await checkoutPage.fillInfo({ firstName, lastName, postalCode });
  },
);

Then('el resumen incluye un total mayor a {string}', async ({ checkoutPage }, min: string) => {
  const total = await checkoutPage.totalText();
  const amount = Number(total?.replace(/[^0-9.]/g, ''));
  expect(amount).toBeGreaterThan(Number(min));
});

When('finaliza la compra', async ({ checkoutPage }) => {
  await checkoutPage.finish();
});

Then('la orden se completa exitosamente', async ({ checkoutPage }) => {
  expect(await checkoutPage.isOrderComplete()).toBe(true);
});

When('ordena los productos por {string}', async ({ inventoryPage }, option: string) => {
  const map: Record<string, 'az' | 'za' | 'lohi' | 'hilo'> = {
    'Name (A to Z)': 'az',
    'Name (Z to A)': 'za',
    'Price (low to high)': 'lohi',
    'Price (high to low)': 'hilo',
  };
  await inventoryPage.sortBy(map[option]);
});

Then('los precios quedan ordenados de menor a mayor', async ({ inventoryPage }) => {
  const prices = await inventoryPage.itemPricesList();
  const sorted = [...prices].sort((a, b) => a - b);
  expect(prices).toEqual(sorted);
});
