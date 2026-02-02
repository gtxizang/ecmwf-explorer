/**
 * Verify smoothing improves visual quality at high zoom
 */
import { test } from '@playwright/test';

test('verify smoothing at UK zoom', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(4000);

  // Switch to multi-year dataset
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Soil Moisture (75 Years)').click();
  await page.waitForTimeout(4000);

  // Zoom to UK - similar to the demo screenshot
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(550, 300);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'test-screenshots/smoothing-uk-zoom.png', fullPage: true });
  console.log('Screenshot: smoothing-uk-zoom.png - verify smoother transitions');
});
