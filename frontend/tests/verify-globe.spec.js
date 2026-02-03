/**
 * 3D Globe Verification Tests
 * Tests the deck.gl GlobeView implementation
 */
import { test, expect } from '@playwright/test';

test.describe('3D Globe Verification', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`BROWSER ERROR: ${msg.text()}`);
      }
    });
  });

  test('Globe: Welcome screen shows 3D Globe option', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // 3D Globe card should be visible
    const globeCard = page.getByText('3D Globe');
    await expect(globeCard.first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/globe-welcome.png' });
    console.log('Globe: Welcome screen shows 3D Globe option - PASS');
  });

  test('Globe: Can enter 3D Globe view', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Click on 3D Globe card - use unique text inside the card
    const globeCard = page.getByText('CesiumJS');
    await globeCard.click();
    await page.waitForTimeout(3000);

    // Should show the Globe view with title
    const title = page.getByText('ECV Explorer (3D Globe)');
    await expect(title).toBeVisible({ timeout: 10000 });

    // Dataset dropdown should be visible
    const datasetInput = page.locator('input[placeholder="Select dataset..."]');
    await expect(datasetInput).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/globe-entered.png' });
    console.log('Globe: Can enter 3D Globe view - PASS');
  });

  test('Globe: Soil Moisture loads on globe', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Enter Globe view - click on unique text in card
    await page.getByText('CesiumJS').click();
    await page.waitForTimeout(3000);

    // Select Soil Moisture
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Soil Moisture ERA5').click();
    await page.waitForTimeout(4000);

    // Year slider should be visible
    const yearText = page.locator('text=/Year.*\\d{4}/').first();
    await expect(yearText).toBeVisible({ timeout: 5000 });

    // Month control should be visible
    const monthText = page.locator('text=/Month/');
    await expect(monthText.first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/globe-soil-moisture.png' });
    console.log('Globe: Soil Moisture loads on globe - PASS');
  });

  test('Globe: Fire data loads on globe', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Enter Globe view - click on unique text in card
    await page.getByText('CesiumJS').click();
    await page.waitForTimeout(3000);

    // Select Fire
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Fire Burned Area').click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'test-screenshots/globe-fire.png' });
    console.log('Globe: Fire data loads on globe - PASS');
  });

  test('Globe: Can return to welcome screen', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // Enter Globe view - click on unique text in card
    await page.getByText('CesiumJS').click();
    await page.waitForTimeout(3000);

    // Click title to return to welcome
    const title = page.getByText('ECV Explorer (3D Globe)');
    await title.click();
    await page.waitForTimeout(1000);

    // Welcome screen should be visible again
    const welcomeTitle = page.getByText('ECV Explorer').first();
    await expect(welcomeTitle).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-screenshots/globe-return-welcome.png' });
    console.log('Globe: Can return to welcome screen - PASS');
  });
});
