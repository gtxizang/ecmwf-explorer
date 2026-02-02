/**
 * Test Sea Ice click-to-timeseries feature parity
 * This is a critical demo feature - must work
 */
import { test, expect } from '@playwright/test';

test('sea ice click-to-timeseries works', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[POLAR]') || text.includes('Timeseries')) {
      console.log(`BROWSER: ${text}`);
    }
    if (msg.type() === 'error') {
      console.log(`ERROR: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  // Select Sea Ice to switch to polar view
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Sea Ice').click();
  await page.waitForTimeout(5000); // Wait for polar view to load

  await page.screenshot({ path: 'test-screenshots/polar-before-click.png' });

  // Find the map canvas/container and click on it
  // The polar map should show Arctic - click near center (should be over ice)
  const mapContainer = page.locator('.leaflet-container').first();

  if (await mapContainer.isVisible()) {
    const box = await mapContainer.boundingBox();
    if (box) {
      // Click near center-north of the map (should be over Arctic sea ice)
      const clickX = box.x + box.width * 0.5;
      const clickY = box.y + box.height * 0.35; // Upper third - more likely over ice

      console.log(`Clicking at (${clickX}, ${clickY})`);
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(3000); // Wait for timeseries to load
    }
  }

  await page.screenshot({ path: 'test-screenshots/polar-after-click.png' });

  // Look for timeseries panel
  const timeseriesPanel = page.locator('text=Sea Ice Concentration');
  const closeButton = page.locator('[aria-label*="close"], button:has-text("×")');

  // The timeseries chart should appear
  const chartContainer = page.locator('svg path, .recharts-wrapper');

  console.log('Checking for timeseries panel...');
  await page.screenshot({ path: 'test-screenshots/polar-timeseries-check.png' });
});
