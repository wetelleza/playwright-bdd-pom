import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const testDir = defineBddConfig({
  paths: ['features/**/*.feature'],
  require: ['steps/**/*.ts', 'support/**/*.ts'],
});

export default defineConfig({
  testDir,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    cucumberReporter('html', { outputFile: 'cucumber-report/report.html' }),
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://demoqa.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // API specs don't touch a browser at all, so they're excluded from the 3 browser
    // projects (no point running them 3x) and get their own project below instead.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /features[\\/]api[\\/]/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /features[\\/]api[\\/]/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /features[\\/]api[\\/]/,
    },
    {
      name: 'api',
      testMatch: /features[\\/]api[\\/]/,
    },
  ],
});
