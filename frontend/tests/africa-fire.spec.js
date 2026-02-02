import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Africa Fire View', () => {
  test('fire data visible over Africa', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[LOD]') || msg.text().includes('[ZARR]')) {
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

    // Switch to Fire Burned Area
    const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Fire Burned Area")').click();
    await page.waitForTimeout(3000);

    // Pan to Africa (drag the map)
    // Africa is roughly at 0°N, 20°E - we need to drag from current view to show Africa
    const map = page.locator('canvas').first();
    const box = await map.boundingBox();

    if (box) {
      // Drag to pan - move east and south to center on Africa
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 - 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(2000);
    }

    // Zoom out to see more area
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'fire-africa-view.png'),
      fullPage: true
    });
    console.log('Screenshot: fire-africa-view.png - should show fire data over Africa/global');
  });

  test('sea ice visible over Arctic', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[LOD]') || msg.text().includes('[ZARR]')) {
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

    // Switch to Sea Ice
    const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetSelect.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Sea Ice")').click();
    await page.waitForTimeout(3000);

    // Sea Ice switches to polar view which uses Leaflet
    await page.waitForTimeout(5000); // Wait for polar view to load

    // The polar view should be centered on the Arctic already
    const mapContainer = page.locator('.leaflet-container').first();
    if (await mapContainer.isVisible()) {
      console.log('Polar map loaded successfully');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'sea-ice-arctic-view.png'),
      fullPage: true
    });
    console.log('Screenshot: sea-ice-arctic-view.png - should show sea ice in Arctic');
  });
});
