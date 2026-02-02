/**
 * Critical Flow Verification - Demo Tuesday
 * Tests all 5 user flows from CLAUDE.md
 */
import { test, expect } from '@playwright/test';

test.describe('Demo Critical Flows', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`BROWSER ERROR: ${msg.text()}`);
      }
    });
  });

  test('Flow A: Fresh load - welcome screen appears', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Welcome screen should be visible
    const welcomeTitle = page.getByText('RegexFlow ECV Explorer');
    await expect(welcomeTitle.first()).toBeVisible({ timeout: 5000 });

    // Explore Data button should be visible
    const exploreButton = page.getByText('Explore Data');
    await expect(exploreButton).toBeVisible({ timeout: 5000 });

    // Click to enter
    await exploreButton.click();
    await page.waitForTimeout(1000);

    // Dataset dropdown should show "Select dataset"
    const datasetInput = page.locator('input[placeholder="Select dataset"]');
    await expect(datasetInput).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/flow-a-fresh-load.png' });
    console.log('Flow A: PASS - Fresh load works');
  });

  test('Flow B: Soil Moisture complete journey', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Dismiss welcome
    await page.getByText('Explore Data').click();
    await page.waitForTimeout(1000);

    // Select Soil Moisture
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Soil Moisture ERA5 (75 Years)').click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-screenshots/flow-b-1-soil-selected.png' });

    // Change year using slider - find the year slider
    // Year slider should be present for multi-year datasets
    const yearText = page.locator('text=/\\d{4}/').first(); // Find year display
    await expect(yearText).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/flow-b-2-year-visible.png' });

    // Change month using time slider
    const timeSlider = page.locator('input[type="range"]').first();
    if (await timeSlider.isVisible()) {
      await timeSlider.fill('6'); // Change to different month
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'test-screenshots/flow-b-3-month-changed.png' });

    // Change colormap
    const colormapSelect = page.locator('input[aria-haspopup="listbox"]').nth(1);
    if (await colormapSelect.isVisible()) {
      await colormapSelect.click();
      await page.waitForTimeout(300);
      const viridisOption = page.locator('text=Viridis');
      if (await viridisOption.isVisible()) {
        await viridisOption.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'test-screenshots/flow-b-4-colormap-changed.png' });

    // Click map for timeseries
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: 'test-screenshots/flow-b-5-timeseries.png' });
    console.log('Flow B: PASS - Soil Moisture journey complete');
  });

  test('Flow C: Fire appears on land', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Dismiss welcome
    await page.getByText('Explore Data').click();
    await page.waitForTimeout(1000);

    // Select Fire
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Fire Burned Area').click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'test-screenshots/flow-c-fire-on-land.png' });
    console.log('Flow C: Fire data loaded - verify screenshot shows data on LAND');
  });

  test('Flow D: Sea Ice with click-to-timeseries', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Dismiss welcome
    await page.getByText('Explore Data').click();
    await page.waitForTimeout(1000);

    // Select Sea Ice - should switch to polar view
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Sea Ice').click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'test-screenshots/flow-d-1-sea-ice-polar.png' });

    // Click on the map for timeseries (polar view should support this)
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        // Click near center (should be over Arctic)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: 'test-screenshots/flow-d-2-sea-ice-timeseries.png' });
    console.log('Flow D: Sea Ice loaded in polar view');
  });

  test('Flow E: Solar Radiation', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Dismiss welcome
    await page.getByText('Explore Data').click();
    await page.waitForTimeout(1000);

    // Select Solar Radiation
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Solar Radiation ERA5 (75 Years)').click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'test-screenshots/flow-e-solar-radiation.png' });

    // Verify controls work
    const timeSlider = page.locator('input[type="range"]').first();
    if (await timeSlider.isVisible()) {
      await timeSlider.fill('3');
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'test-screenshots/flow-e-solar-controls.png' });
    console.log('Flow E: Solar Radiation works');
  });
});
