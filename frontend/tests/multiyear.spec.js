/**
 * Test multi-year soil moisture dataset - verify year slider works
 */
import { test, expect } from '@playwright/test';

test.describe('Multi-year Dataset', () => {
  test('year slider changes data', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[ZARR]') || text.includes('[LOD]') || text.includes('year') || text.includes('stats')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(6000);

    // Take initial screenshot - should show 2020 data
    await page.screenshot({ path: 'test-screenshots/multiyear-year-2020.png', fullPage: true });
    console.log('Screenshot: multiyear-year-2020.png (initial year 2020)');

    // Find and change year slider to 1960
    const rangeInputs = await page.locator('input[type="range"]').all();
    console.log(`Found ${rangeInputs.length} range inputs`);

    if (rangeInputs.length >= 2) {
      // First range is year slider
      await rangeInputs[0].fill('1960');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-screenshots/multiyear-year-1960.png', fullPage: true });
      console.log('Screenshot: multiyear-year-1960.png');

      // Change to 1980
      await rangeInputs[0].fill('1980');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-screenshots/multiyear-year-1980.png', fullPage: true });
      console.log('Screenshot: multiyear-year-1980.png');

      // Change to 2010
      await rangeInputs[0].fill('2010');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-screenshots/multiyear-year-2010.png', fullPage: true });
      console.log('Screenshot: multiyear-year-2010.png');

      // Change month to July
      await rangeInputs[1].fill('6');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-screenshots/multiyear-year-2010-july.png', fullPage: true });
      console.log('Screenshot: multiyear-year-2010-july.png');
    }

    console.log('Year slider test completed');
  });

  test('timeseries panel shows year', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[ZARR]') || text.includes('[Timeseries]') || text.includes('year')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(4000);

    // Switch to multi-year dataset by clicking on the dropdown input
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);

    // Select multi-year option from dropdown
    await page.locator('text=Soil Moisture (75 Years)').click();
    await page.waitForTimeout(5000);

    // Click on Germany (land area) to trigger timeseries
    await page.mouse.click(700, 340);
    await page.waitForTimeout(4000);

    // Screenshot showing timeseries panel with year
    await page.screenshot({ path: 'test-screenshots/multiyear-timeseries-with-year.png', fullPage: true });
    console.log('Screenshot: multiyear-timeseries-with-year.png');

    // Check that timeseries title contains the year for multi-year data
    const timeseriesTitle = page.locator('text=/Timeseries \\(\\d{4}\\)/');
    const visible = await timeseriesTitle.isVisible().catch(() => false);
    console.log(`Timeseries title with year visible: ${visible}`);
  });
});
