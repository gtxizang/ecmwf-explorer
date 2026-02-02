/**
 * Test Fire data renders over Africa/Australia
 * Fire data is sparse in Europe, but should be visible in fire-prone regions
 */
import { test, expect } from '@playwright/test';

test('fire data visible over Africa/Australia', async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`BROWSER ERROR: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  // Select Fire
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Fire Burned Area').click();
  await page.waitForTimeout(4000);

  // Click Australia quick view button (kangaroo emoji)
  const ausButton = page.locator('button:has-text("🦘")');
  if (await ausButton.isVisible()) {
    await ausButton.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: 'test-screenshots/fire-australia.png' });

  // Click Global quick view
  const globalButton = page.locator('button:has-text("🌍")');
  if (await globalButton.isVisible()) {
    await globalButton.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: 'test-screenshots/fire-global.png' });

  // Change to August (peak fire season in many regions)
  const timeSlider = page.locator('input[type="range"]').first();
  if (await timeSlider.isVisible()) {
    await timeSlider.fill('7'); // August
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'test-screenshots/fire-august.png' });
  console.log('Fire screenshots taken - check for data visibility');
});
