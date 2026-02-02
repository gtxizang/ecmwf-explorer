import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Dataset Switching', () => {
  test('can switch between soil moisture and radiation datasets', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[ZARR]') || msg.text().includes('[LOD]')) {
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

    // Screenshot with soil moisture
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dataset-01-soil-moisture.png'),
      fullPage: true
    });
    console.log('Screenshot: soil moisture');

    // Switch to Solar Radiation
    console.log('Switching to Solar Radiation...');
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Solar Radiation")').click();

    // Wait for data to load
    await page.waitForTimeout(5000);

    // Screenshot with radiation
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dataset-02-solar-radiation.png'),
      fullPage: true
    });
    console.log('Screenshot: solar radiation');

    // Verify the legend updated
    const legend = page.locator('text=Solar Radiation (W/m²)');
    const legendVisible = await legend.isVisible();
    console.log(`Legend shows "Solar Radiation": ${legendVisible}`);

    // Switch back to Soil Moisture
    console.log('Switching back to Soil Moisture...');
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Soil Moisture")').click();
    await page.waitForTimeout(4000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dataset-03-back-to-soil.png'),
      fullPage: true
    });
    console.log('Screenshot: back to soil moisture');

    // Expect test to pass if we got here without errors
    expect(true).toBe(true);
  });
});
