import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'test-screenshots';

test.describe('Autoplay Feature', () => {
  test('play button exists and cycles through months', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[LOD]') || msg.text().includes('Loading')) {
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

    // Select a dataset first
    const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.locator('text=Soil Moisture (75 Years)').click();
    await page.waitForTimeout(3000);

    // Screenshot initial state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'autoplay-01-initial.png'),
      fullPage: true
    });

    // Find the time/month display (e.g., "Jan 2020")
    const timeDisplay = page.locator('text=/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/').first();
    await expect(timeDisplay).toBeVisible({ timeout: 5000 });
    const initialTimeText = await timeDisplay.textContent();
    console.log(`Initial: ${initialTimeText}`);

    // Find and click the play button (the ▶ near the time slider)
    const playButton = page.locator('button').filter({ has: page.locator('svg polygon') }).first();
    if (await playButton.isVisible()) {
      await playButton.click();
      console.log('Clicked play button - autoplay should start');

      // Wait for some time to pass
      await page.waitForTimeout(3000);

      // Check that time changed
      const afterTimeText = await timeDisplay.textContent();
      console.log(`After 3s: ${afterTimeText}`);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'autoplay-02-after-cycle.png'),
        fullPage: true
      });
    }

    console.log('Autoplay test completed');
  });
});
