import { test } from '@playwright/test';

test.describe('Polar Map View', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));
  });

  test('polar view with GIBS basemap', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(5000);

    // Take initial screenshot
    await page.screenshot({ path: 'test-screenshots/01-initial-view.png', fullPage: true });
    console.log('Screenshot saved: 01-initial-view.png');

    // Click on the Dataset dropdown (Mantine Select)
    const datasetDropdown = page.locator('[data-testid="dataset-select"], .mantine-Select-input').first();
    await datasetDropdown.click({ timeout: 5000 }).catch(() => {
      console.log('Could not click dataset dropdown directly');
    });
    await page.waitForTimeout(500);

    // Try clicking by label
    await page.click('text=Soil Moisture', { timeout: 3000 }).catch(() => {
      console.log('Could not find Soil Moisture text');
    });
    await page.waitForTimeout(500);

    // Look for dropdown options and click Sea Ice
    const seaIceOption = page.locator('text=Sea Ice (Polar View)').first();
    const isVisible = await seaIceOption.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      await seaIceOption.click();
      console.log('Selected Sea Ice dataset');
      await page.waitForTimeout(6000);
      await page.screenshot({ path: 'test-screenshots/02-polar-gibs-basemap.png', fullPage: true });
      console.log('Screenshot saved: 02-polar-gibs-basemap.png');
    } else {
      console.log('Sea Ice option not visible, dropdown may not have opened');
      await page.screenshot({ path: 'test-screenshots/02-dropdown-state.png', fullPage: true });
    }
  });
});
