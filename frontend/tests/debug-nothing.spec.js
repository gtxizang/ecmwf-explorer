/**
 * Debug: Why does nothing happen when selecting soil moisture?
 */
import { test } from '@playwright/test';

test('debug soil moisture selection', async ({ page }) => {
  const logs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);
    console.log(`BROWSER ${msg.type()}: ${text}`);
  });

  page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`PAGE ERROR: ${err.message}`);
  });

  await page.goto('http://localhost:5173');
  console.log('1. Page loaded');
  await page.waitForTimeout(2000);

  // Check if welcome screen is visible
  const welcomeVisible = await page.getByText('Explore Data').isVisible();
  console.log(`2. Explore Data button visible: ${welcomeVisible}`);

  // Click Explore Data
  const exploreButton = page.getByText('Explore Data');
  if (await exploreButton.isVisible()) {
    console.log('3. Clicking Explore Data...');
    await exploreButton.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: 'test-screenshots/debug-after-explore.png' });
  console.log('4. Screenshot after Explore Data click');

  // Check the dataset dropdown
  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  const inputVisible = await datasetInput.isVisible();
  console.log(`5. Dataset input visible: ${inputVisible}`);

  if (inputVisible) {
    console.log('6. Clicking dataset dropdown...');
    await datasetInput.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/debug-dropdown-open.png' });

    // Find and click Soil Moisture
    console.log('7. Looking for Soil Moisture option...');
    const soilOption = page.locator('text=Soil Moisture').first();
    if (await soilOption.isVisible()) {
      console.log('8. Clicking Soil Moisture...');
      await soilOption.click();
      await page.waitForTimeout(5000); // Wait for data to load
      await page.screenshot({ path: 'test-screenshots/debug-after-soil-select.png' });
      console.log('9. Screenshot after Soil Moisture selection');
    } else {
      console.log('8. ERROR: Soil Moisture option not visible');
    }
  }

  // Dump all logs
  console.log('\n=== ALL BROWSER LOGS ===');
  logs.forEach(l => console.log(l));

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log(e));
  }
});
