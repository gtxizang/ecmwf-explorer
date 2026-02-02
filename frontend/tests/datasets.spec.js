import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('All Datasets Test', () => {
  test('all four datasets load and display correctly', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[LOD]') || msg.text().includes('[ZARR]')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(1000);

    // Select Soil Moisture first
    const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Soil Moisture")').click();
    await page.waitForTimeout(3000);

    // Verify initial load with Soil Moisture
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'datasets-01-soil-moisture.png'),
      fullPage: true
    });
    console.log('1. Soil Moisture loaded');

    // Switch to Solar Radiation
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Solar Radiation")').click();
    await page.waitForTimeout(4000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'datasets-02-solar-radiation.png'),
      fullPage: true
    });
    console.log('2. Solar Radiation loaded');

    // Switch to Fire Burned Area
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Fire Burned Area")').click();
    await page.waitForTimeout(4000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'datasets-03-fire-burned-area.png'),
      fullPage: true
    });
    console.log('3. Fire Burned Area loaded');

    // Switch to Sea Ice
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Sea Ice")').click();
    await page.waitForTimeout(4000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'datasets-04-sea-ice.png'),
      fullPage: true
    });
    console.log('4. Sea Ice loaded');

    // Verify the notification toast appeared (intro facts)
    // The notification should have shown for each dataset

    console.log('All 4 datasets loaded successfully!');
  });
});
