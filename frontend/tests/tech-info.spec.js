import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Tech Info Panel', () => {
  test('Tech Info panel expands and shows all sections', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(3000);

    // Screenshot with panel collapsed
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'tech-info-01-collapsed.png'),
      fullPage: true
    });

    // Click to expand Tech Info panel (click the ▶ button)
    const expandButton = page.locator('button:has-text("▶")');
    await expandButton.click();
    await page.waitForTimeout(500);

    // Screenshot with panel expanded - soil moisture
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'tech-info-02-expanded-soil.png'),
      fullPage: true
    });

    // Verify sections are visible
    await expect(page.locator('text=Current View')).toBeVisible();
    await expect(page.locator('text=Data Source')).toBeVisible();
    await expect(page.locator('text=Raw Data')).toBeVisible();
    await expect(page.locator('text=Data Processing')).toBeVisible();
    await expect(page.locator('text=Basemap')).toBeVisible();
    await expect(page.locator('text=Browser Technologies')).toBeVisible();
    await expect(page.locator('text=Backend Technologies')).toBeVisible();
    await expect(page.locator('text=Current Data URL')).toBeVisible();

    // Verify source link is clickable
    const sourceLink = page.locator('a:has-text("Copernicus Climate Data Store")').first();
    await expect(sourceLink).toBeVisible();
    const href = await sourceLink.getAttribute('href');
    expect(href).toContain('cds.climate.copernicus.eu');

    // Switch to Solar Radiation
    const datasetSelect = page.locator('.mantine-Select-input').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Solar Radiation")').click();
    await page.waitForTimeout(3000);

    // Screenshot with solar radiation
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'tech-info-03-expanded-solar.png'),
      fullPage: true
    });

    // Verify content changed
    await expect(page.locator("text=Earth's radiation budget")).toBeVisible();
    await expect(page.locator('text=CERES/NASA')).toBeVisible();

    console.log('Tech Info panel test passed');
  });
});
