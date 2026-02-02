/**
 * Test load timer appears and shows reasonable values
 */
import { test, expect } from '@playwright/test';

test('load timer shows in Tech Info', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('[TIMER]')) {
      console.log(`BROWSER: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  // Select Soil Moisture
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Soil Moisture (75 Years)').click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'test-screenshots/timer-soil-moisture.png' });

  // Switch to Fire to see timer reset and measure again
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Fire Burned Area').click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'test-screenshots/timer-fire.png' });

  console.log('Timer test complete - check screenshots');
});
