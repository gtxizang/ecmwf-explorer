import { test } from '@playwright/test';

test('quick polar view test', async ({ page }) => {
  // Go directly to polar view by modifying localStorage
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Take initial screenshot
  await page.screenshot({ path: 'test-screenshots/main-view.png', fullPage: true });

  // Simulate selecting sea ice by going to the url with polar view
  // For now, just wait and capture what's visible
  await page.evaluate(() => {
    console.log('Taking screenshot of current state');
  });

  await page.screenshot({ path: 'test-screenshots/current-state.png', fullPage: true });
  console.log('Screenshot saved');
});
