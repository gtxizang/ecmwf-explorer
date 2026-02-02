/**
 * Test dataset loading visuals in welcome screen
 */
import { test } from '@playwright/test';

test('capture dataset loading visuals', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('[PRELOAD]')) {
      console.log(`BROWSER: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Find and scroll the welcome paper element
  await page.evaluate(() => {
    const paper = document.querySelector('[class*="mantine-Paper"]');
    if (paper) paper.scrollTop = paper.scrollHeight;
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'test-screenshots/dataset-visuals-1.png' });
  console.log('Screenshot: dataset-visuals-1.png - scrolled to bottom');

  // Wait for preloading to progress
  await page.waitForTimeout(15000);

  await page.evaluate(() => {
    const paper = document.querySelector('[class*="mantine-Paper"]');
    if (paper) paper.scrollTop = paper.scrollHeight;
  });
  await page.screenshot({ path: 'test-screenshots/dataset-visuals-2.png' });
  console.log('Screenshot: dataset-visuals-2.png - after preloading');
});
