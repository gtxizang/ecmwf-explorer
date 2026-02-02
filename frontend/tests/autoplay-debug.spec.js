/**
 * Debug autoplay flashing and blockiness
 */
import { test } from '@playwright/test';

test('debug 75yr autoplay', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[LOD]') || text.includes('[CACHE]') || text.includes('level')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  const exploreButton = page.getByText('Explore Data');
  if (await exploreButton.isVisible()) {
    await exploreButton.click();
  }
  await page.waitForTimeout(2000);

  // Switch to 75 year dataset
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Soil Moisture (75 Years)').click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'test-screenshots/autoplay-before.png' });
  console.log('Screenshot: autoplay-before.png');

  // Start autoplay
  const playButton = page.locator('button').filter({ has: page.locator('svg') }).first();
  // Find play button by looking for the play icon or aria label
  const playBtn = page.locator('[aria-label*="play"], button:has(svg)').first();

  // Click play button in the time slider area
  await page.locator('text=Jan').first().locator('..').locator('button').first().click();
  await page.waitForTimeout(500);

  // Take screenshots during autoplay
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-screenshots/autoplay-frame-${i}.png` });
    console.log(`Screenshot: autoplay-frame-${i}.png`);
  }
});
