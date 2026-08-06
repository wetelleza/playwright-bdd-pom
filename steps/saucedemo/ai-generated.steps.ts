import { expect } from '@playwright/test';
import { Given, When, Then } from '../../support/fixtures';

// Generado por IA (ai:generate --implement-missing) — revisar
Then('los precios quedan ordenados de mayor a menor', async ({ inventoryPage }) => {
  const prices = await inventoryPage.itemPricesList();
  const sorted = [...prices].sort((a, b) => b - a);
  expect(prices).toEqual(sorted);
});

// Generado por IA (ai:generate --implement-missing) — revisar
Then('el primer producto del listado es el mas caro', async ({ inventoryPage }) => {
  const prices = await inventoryPage.itemPricesList();
  const maxPrice = Math.max(...prices);
  expect(prices[0]).toBe(maxPrice);
});
