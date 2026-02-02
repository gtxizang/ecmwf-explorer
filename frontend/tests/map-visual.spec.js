import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe('Climate Map Visual Verification', () => {

  test('renders map and climate data', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];
    const networkErrors = [];

    // Capture all console messages
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
      console.log(text);
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      const text = `[PAGE ERROR] ${error.message}`;
      consoleErrors.push(text);
      console.error(text);
    });

    // Capture failed network requests
    page.on('requestfailed', (request) => {
      const text = `[NETWORK FAIL] ${request.url()} - ${request.failure()?.errorText}`;
      networkErrors.push(text);
      console.error(text);
    });

    // Track successful data requests
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('soil_moisture_cp') || url.includes('.zarray') || url.includes('.zattrs')) {
        console.log(`[NETWORK OK] ${response.status()} ${url.split('/').slice(-3).join('/')}`);
      }
    });

    console.log('\n========== STARTING MAP TEST ==========\n');

    // Navigate to the app
    console.log('1. Navigating to app...');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);  // Wait for map to initialize

    // Take initial screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-initial-load.png'),
      fullPage: true
    });
    console.log('   Screenshot: 01-initial-load.png');

    // Wait for map canvas to appear
    console.log('2. Waiting for map canvas...');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    console.log('   Canvas found');

    // Wait a bit for initial tiles to load
    await page.waitForTimeout(3000);

    // Take screenshot after initial load
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-after-load.png'),
      fullPage: true
    });
    console.log('   Screenshot: 02-after-load.png');

    // Get tech info from the page
    console.log('3. Reading Tech Info panel...');
    const techInfoText = await page.locator('text=Tech Info').locator('..').textContent();
    console.log(`   Tech Info panel: ${techInfoText?.substring(0, 100)}...`);

    // Extract LOD and Zoom from Tech Info panel (format: "LOD 3" and "z2.0")
    const lodMatch = techInfoText?.match(/LOD\s*(\d+)/);
    const zoomMatch = techInfoText?.match(/Zoom\s*([\d.]+)/);
    console.log(`   Current Zoom: ${zoomMatch?.[1] || 'unknown'}`);
    console.log(`   Current LOD: ${lodMatch?.[1] || 'unknown'}`);

    // Zoom to Ireland (approximately -8, 53)
    console.log('4. Zooming to Ireland...');

    // Use wheel events to zoom in on canvas
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      // Move to center of map
      await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);

      // Zoom in with wheel
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, -200);
        await page.waitForTimeout(500);
      }
    }

    // Wait for tiles to load after zoom (LOD 5 takes longer for 4096x4096 data)
    await page.waitForTimeout(5000);

    // Take screenshot after zoom
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-zoomed.png'),
      fullPage: true
    });
    console.log('   Screenshot: 03-zoomed.png');

    // Get updated tech info
    const techInfoAfterZoom = await page.locator('text=Tech Info').locator('..').textContent();
    const lodMatchAfter = techInfoAfterZoom?.match(/LOD\s*(\d+)/);
    const zoomMatchAfter = techInfoAfterZoom?.match(/Zoom\s*([\d.]+)/);
    console.log(`   After zoom - Zoom: ${zoomMatchAfter?.[1]}, LOD: ${lodMatchAfter?.[1]}`);

    // Test time slider
    console.log('5. Testing time slider...');
    const slider = page.locator('.mantine-Slider-root');
    if (await slider.isVisible()) {
      // Click near the middle of slider
      const sliderBox = await slider.boundingBox();
      if (sliderBox) {
        await page.mouse.click(sliderBox.x + sliderBox.width * 0.5, sliderBox.y + sliderBox.height / 2);
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, '04-time-changed.png'),
          fullPage: true
        });
        console.log('   Screenshot: 04-time-changed.png');
      }
    }

    // Final summary
    console.log('\n========== TEST SUMMARY ==========');
    console.log(`Total console logs: ${consoleLogs.length}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Network errors: ${networkErrors.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n--- Console Errors ---');
      consoleErrors.forEach(e => console.log(e));
    }

    if (networkErrors.length > 0) {
      console.log('\n--- Network Errors ---');
      networkErrors.forEach(e => console.log(e));
    }

    // Save full log
    const fullLog = {
      timestamp: new Date().toISOString(),
      consoleLogs,
      consoleErrors,
      networkErrors,
      finalZoom: zoomMatchAfter?.[1],
      finalLOD: lodMatchAfter?.[1],
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'test-log.json'),
      JSON.stringify(fullLog, null, 2)
    );
    console.log('\nFull log saved to test-screenshots/test-log.json');

    console.log('\n========== TEST COMPLETE ==========\n');
  });
});
