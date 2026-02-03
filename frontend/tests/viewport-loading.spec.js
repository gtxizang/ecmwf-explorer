// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Viewport Loading Tests', () => {

  test('Basic app loads without errors', async ({ page }) => {
    // Listen for console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      errors.push(err.message);
    });

    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);

    // Check no critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors).toEqual([]);
  });

  test('Welcome screen appears and can be dismissed', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for welcome screen
    await page.waitForTimeout(1000);

    // Look for Enter/Start button
    const enterButton = page.locator('button').filter({ hasText: /enter|start|explore/i }).first();

    if (await enterButton.isVisible()) {
      await enterButton.click();
      await page.waitForTimeout(500);
    }

    // Should see map or controls now
    const hasMap = await page.locator('.leaflet-container, canvas, [class*="deck"]').first().isVisible();
    expect(hasMap).toBeTruthy();
  });

  test('Soil Moisture dataset loads without error', async ({ page }) => {
    const errors = [];
    const logs = [];

    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);

    // Dismiss welcome screen if present
    const enterButton = page.locator('button').filter({ hasText: /enter|start|explore/i }).first();
    if (await enterButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await enterButton.click();
      await page.waitForTimeout(1000);
    }

    // Take a screenshot to debug
    await page.screenshot({ path: 'test-results/debug-before-select.png' });

    // Find the Dataset dropdown - look for input with placeholder or the clickable area
    const datasetDropdown = page.locator('[class*="mantine"] input[placeholder*="dataset" i], [class*="Select"] input, input[placeholder*="Select" i]').first();

    // If not found, try clicking on the Dataset label area
    if (!await datasetDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click near the Dataset label
      const datasetLabel = page.getByText('Dataset', { exact: true });
      if (await datasetLabel.isVisible()) {
        // Click below the label where the dropdown should be
        const box = await datasetLabel.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height + 20);
        }
      }
    } else {
      await datasetDropdown.click();
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/debug-after-click.png' });

    // Select Soil Moisture from dropdown options
    const soilOption = page.getByText(/Soil Moisture ERA5/i).first();
    await expect(soilOption).toBeVisible({ timeout: 3000 });
    await soilOption.click();

    // Wait for data to load
    await page.waitForTimeout(8000);

    // Print all logs for debugging
    console.log('=== Console logs ===');
    logs.forEach(l => console.log(l));
    console.log('=== Errors ===');
    errors.forEach(e => console.log(e));

    // Check for the specific error
    const hasEmptyIteratorError = errors.some(e => e.includes('empty iterator'));
    if (hasEmptyIteratorError) {
      console.log('FOUND EMPTY ITERATOR ERROR');
    }
    expect(hasEmptyIteratorError).toBeFalsy();
  });

  test('Console shows viewport loading messages when zoomed in', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('[VIEWPORT]') || msg.text().includes('[CACHE]')) {
        logs.push(msg.text());
      }
    });

    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Dismiss welcome
    const enterButton = page.locator('button').filter({ hasText: /enter|start|explore/i }).first();
    if (await enterButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await enterButton.click();
      await page.waitForTimeout(500);
    }

    // Select dataset
    const selector = page.locator('select, [role="combobox"]').first();
    await selector.selectOption({ label: /soil moisture/i }).catch(() => {});

    // Wait for initial load
    await page.waitForTimeout(3000);

    // Zoom in using keyboard or mouse wheel
    const mapContainer = page.locator('canvas, .leaflet-container, [class*="deck"]').first();
    await mapContainer.click();

    // Zoom in multiple times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Equal'); // + key to zoom in
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(2000);

    // Check logs
    console.log('Captured logs:', logs);
  });

});
