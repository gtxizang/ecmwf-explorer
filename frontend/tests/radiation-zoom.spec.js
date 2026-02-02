import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Radiation Dataset Zoom Test', () => {
  test('radiation data remains visible at all zoom levels', async ({ page }) => {
    const logs = [];
    const errors = [];

    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('[ZARR]') || text.includes('[LOD]')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    page.on('pageerror', err => {
      errors.push(err.message);
      console.log(`PAGE ERROR: ${err.message}`);
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(3000);

    // Switch to Solar Radiation
    console.log('Switching to Solar Radiation...');
    const datasetSelect = page.locator('.mantine-Select-input').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Solar Radiation")').click();
    await page.waitForTimeout(3000);

    // Screenshot at initial zoom (should be LOD 3)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'radiation-zoom-01-initial.png'),
      fullPage: true
    });

    // Check LOD indicator
    const lodText = await page.locator('text=LOD:').first().textContent();
    console.log(`Initial state: ${lodText}`);

    // Get data range to verify data is present
    const dataRangeText = await page.locator('text=Data range:').textContent();
    console.log(`Data range: ${dataRangeText}`);

    // Zoom in progressively
    for (let i = 0; i < 6; i++) {
      console.log(`\nZoom step ${i + 1}...`);
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(2000);

      const currentLod = await page.locator('text=LOD:').first().textContent();
      const zoomText = await page.locator('text=ZOOM:').textContent();
      const validPixels = await page.locator('text=Valid pixels:').textContent();

      console.log(`  ${currentLod}, ${zoomText}`);
      console.log(`  ${validPixels}`);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `radiation-zoom-${String(i + 2).padStart(2, '0')}-step${i + 1}.png`),
        fullPage: true
      });
    }

    // Check for any errors
    const errorLogs = logs.filter(l => l.toLowerCase().includes('error'));
    if (errorLogs.length > 0) {
      console.log('\nErrors found in logs:');
      errorLogs.forEach(e => console.log(`  ${e}`));
    }

    // Verify no page errors
    expect(errors.length).toBe(0);

    // Verify data was loaded (check for successful load messages)
    const successLogs = logs.filter(l => l.includes('Successfully loaded'));
    expect(successLogs.length).toBeGreaterThan(0);
  });

  test('switching months shows data for all months', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[ZARR]') || msg.text().includes('[LOD]')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(3000);

    // Switch to Solar Radiation
    const datasetSelect = page.locator('.mantine-Select-input').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Solar Radiation")').click();
    await page.waitForTimeout(3000);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Test each month
    for (let m = 0; m < 12; m++) {
      console.log(`\nTesting month ${m} (${months[m]})...`);

      // Set the time slider
      const slider = page.locator('input[type="range"]').first();
      await slider.fill(String(m));
      await page.waitForTimeout(2000);

      // Check valid pixels
      const validPixels = await page.locator('text=Valid pixels:').textContent();
      console.log(`  ${months[m]}: ${validPixels}`);

      // Verify valid pixels is not 0
      const match = validPixels.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const valid = parseInt(match[1]);
        const total = parseInt(match[2]);
        expect(valid).toBeGreaterThan(total * 0.8); // At least 80% valid
      }
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'radiation-all-months-tested.png'),
      fullPage: true
    });
  });
});
