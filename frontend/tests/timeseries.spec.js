import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Click-to-Timeseries', () => {
  test('clicking map shows timeseries chart', async ({ page }) => {
    // Listen for console
    page.on('console', msg => {
      if (msg.text().includes('[Timeseries]')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(5000); // Wait for initial load

    // Take screenshot before click
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'timeseries-01-before-click.png'),
      fullPage: true
    });
    console.log('Screenshot: before click');

    // Click on Ireland (approximately)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Get canvas bounds and click in the middle-right area (where Ireland should be)
    const bounds = await canvas.boundingBox();
    const clickX = bounds.x + bounds.width * 0.55; // Slightly right of center
    const clickY = bounds.y + bounds.height * 0.35; // Upper portion

    console.log(`Clicking at (${clickX}, ${clickY})`);
    await page.mouse.click(clickX, clickY);

    // Wait for timeseries to load
    await page.waitForTimeout(4000);

    // Take screenshot after click
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'timeseries-02-after-click.png'),
      fullPage: true
    });
    console.log('Screenshot: after click');

    // Check if timeseries panel appeared
    const timeseriesPanel = page.locator('text=Soil Moisture Timeseries');
    const panelVisible = await timeseriesPanel.isVisible();
    console.log(`Timeseries panel visible: ${panelVisible}`);

    // Check for location text
    const locationText = page.locator('text=/Location:/');
    if (await locationText.isVisible()) {
      const text = await locationText.textContent();
      console.log(`Location: ${text}`);
    }

    // Verify chart exists
    const chart = page.locator('.recharts-wrapper');
    if (await chart.isVisible()) {
      console.log('Recharts chart is visible');
    }

    // Click elsewhere to update
    const clickX2 = bounds.x + bounds.width * 0.7;
    const clickY2 = bounds.y + bounds.height * 0.5;
    console.log(`Clicking new location at (${clickX2}, ${clickY2})`);
    await page.mouse.click(clickX2, clickY2);
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'timeseries-03-second-click.png'),
      fullPage: true
    });
    console.log('Screenshot: second click location');

    // Close the panel
    const closeButton = page.locator('button[aria-label="Close"]').or(page.locator('.mantine-CloseButton-root'));
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
      await page.waitForTimeout(500);
      console.log('Closed timeseries panel');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'timeseries-04-panel-closed.png'),
      fullPage: true
    });
    console.log('Screenshot: panel closed');
  });
});
