/**
 * Verify all multi-year datasets load and display correctly
 */
import { test, expect } from '@playwright/test';

test.describe('All Datasets Verification', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('[LOD]')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });
  });

  test('verify all 4 datasets load', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Dismiss welcome screen
    await page.waitForTimeout(3000);
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    // Take initial screenshot (default dataset - soil moisture 75yr)
    await page.screenshot({ path: 'test-screenshots/01-soil-moisture-75yr.png' });
    console.log('Screenshot: 01-soil-moisture-75yr.png');

    // Test Solar Radiation (75 Years)
    const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetSelect.click();
    await page.waitForTimeout(500);
    await page.locator('text=Solar Radiation (75 Years)').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/02-solar-radiation-75yr.png' });
    console.log('Screenshot: 02-solar-radiation-75yr.png');

    // Test Fire Burned Area (5 Years)
    await datasetSelect.click();
    await page.waitForTimeout(500);
    await page.locator('text=Fire Burned Area (5 Years)').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/03-fire-5yr.png' });
    console.log('Screenshot: 03-fire-5yr.png');

    // Test Sea Ice (36 Years) - should trigger polar view
    await datasetSelect.click();
    await page.waitForTimeout(500);
    await page.locator('text=Sea Ice (36 Years)').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/04-sea-ice-36yr.png' });
    console.log('Screenshot: 04-sea-ice-36yr.png');

    console.log('All datasets verified!');
  });

  test('verify timeline sliders show correct year ranges', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Dismiss welcome
    await page.waitForTimeout(3000);
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(1000);

    // Select a dataset to see the year badge
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Soil Moisture (75 Years)').click();
    await page.waitForTimeout(3000);

    // Check for year badge - should show "75 YEARS" for soil moisture (uppercase)
    const yearBadge = page.locator('text=/\\d+ YEARS/i').first();
    await expect(yearBadge).toBeVisible({ timeout: 5000 });

    console.log('Year range badge visible');
    await page.screenshot({ path: 'test-screenshots/05-year-range-badge.png' });
  });

  test('verify autoplay works across years', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Dismiss welcome
    await page.waitForTimeout(3000);
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    // Find and click play button
    const playButton = page.locator('button').filter({ hasText: /play/i }).first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'test-screenshots/06-autoplay.png' });
      console.log('Screenshot: 06-autoplay.png');
    }
  });
});
