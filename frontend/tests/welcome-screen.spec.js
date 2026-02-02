/**
 * Test welcome screen functionality
 */
import { test } from '@playwright/test';

test('welcome screen shows and dismisses', async ({ page }) => {
  const logs = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);
    if (text.includes('[PRELOAD]') || text.includes('Error')) {
      console.log(`BROWSER ${msg.type()}: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`PAGE ERROR: ${err.message}`);
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Screenshot welcome screen
  await page.screenshot({ path: 'test-screenshots/welcome-screen-1.png', fullPage: true });
  console.log('Screenshot: welcome-screen-1.png - initial welcome');

  // Wait for some facts to rotate
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-screenshots/welcome-screen-2.png', fullPage: true });
  console.log('Screenshot: welcome-screen-2.png - after fact rotation');

  // Click the Explore Data button
  const exploreButton = page.getByText('Explore Data');
  if (await exploreButton.isVisible()) {
    await exploreButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-screenshots/welcome-screen-3.png', fullPage: true });
    console.log('Screenshot: welcome-screen-3.png - after dismissing welcome');
  }

  console.log('Preload logs:', logs.filter(l => l.includes('PRELOAD')));
});
