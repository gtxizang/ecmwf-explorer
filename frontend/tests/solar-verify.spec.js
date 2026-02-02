/**
 * Verify Solar Radiation data alignment
 */
import { test } from '@playwright/test';

test('solar radiation displays correctly', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[ZARR]') || text.includes('radiation') || text.includes('Bounds')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(4000);

  // Switch to Solar Radiation
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(500);
  await page.locator('text=Solar Radiation').click();
  await page.waitForTimeout(5000);

  // Screenshot to verify alignment
  await page.screenshot({ path: 'test-screenshots/solar-radiation-verify.png', fullPage: true });
  console.log('Screenshot: solar-radiation-verify.png');
});
