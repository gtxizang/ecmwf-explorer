/**
 * Check preloading activity
 */
import { test } from '@playwright/test';

test('verify preloading downloads data', async ({ page }) => {
  const preloadLogs = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PRELOAD]')) {
      preloadLogs.push(text);
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');

  // Wait longer to see all preloading complete
  console.log('Waiting for preloading to complete...');
  await page.waitForTimeout(45000);

  console.log('\n=== PRELOAD SUMMARY ===');
  console.log(`Total preload operations: ${preloadLogs.length}`);
  preloadLogs.forEach(log => console.log(log));
});
