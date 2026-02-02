/**
 * Debug polar sea ice loading
 */
import { test } from '@playwright/test';

test('check polar sea ice loading', async ({ page }) => {
  const errors = [];
  const logs = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);
    if (text.includes('[POLAR]') || text.includes('Error') || text.includes('error')) {
      console.log(`BROWSER ${msg.type()}: ${text}`);
    }
  });

  page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`PAGE ERROR: ${err.message}`);
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);

  // Switch to Sea Ice dataset to trigger polar view
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Sea Ice').click();
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'test-screenshots/polar-debug.png', fullPage: true });
  console.log('Screenshot saved: polar-debug.png');

  if (errors.length > 0) {
    console.log('ERRORS:', errors);
  }
});
