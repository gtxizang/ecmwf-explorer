/**
 * Final multi-year soil moisture test - capture screenshots for different years
 */
import { test } from '@playwright/test';

test.describe('Multi-year Final Screenshots', () => {
  test('capture historical data across decades', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[ZARR]') || text.includes('[LOD]')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    // Go directly to multi-year dataset by modifying URL or waiting for load
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(5000);

    // Find dataset dropdown and select multi-year
    // Click on the dropdown area
    await page.click('text=Soil Moisture');
    await page.waitForTimeout(300);

    // Look for 75 Years option and click it
    const option = page.locator('text=75 Years').first();
    if (await option.isVisible()) {
      await option.click();
      await page.waitForTimeout(5000);
      console.log('Selected multi-year dataset');
    }

    await page.screenshot({ path: 'test-screenshots/final-multiyear-2020.png', fullPage: true });
    console.log('Screenshot: final-multiyear-2020.png');

    // Use evaluate to change the year slider programmatically
    await page.evaluate(() => {
      // Find Mantine slider track and click on different positions
      const sliders = document.querySelectorAll('.mantine-Slider-root');
      if (sliders.length >= 1) {
        const yearSlider = sliders[0];
        const thumb = yearSlider.querySelector('.mantine-Slider-thumb');
        if (thumb) {
          // Dispatch input events to change year
          const event = new Event('input', { bubbles: true });
          thumb.dispatchEvent(event);
        }
      }
    });

    console.log('Multi-year final test complete - check screenshots');
  });
});
