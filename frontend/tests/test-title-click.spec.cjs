const { test, expect } = require('@playwright/test');

test('clicking title returns to welcome screen', async ({ page }) => {
  // Load with a dataset
  await page.goto('http://localhost:5174?dataset=soil_moisture_multiyear&year=2020&month=7');
  await page.waitForTimeout(3000);

  // Screenshot before clicking
  await page.screenshot({ path: '../screenshots/title-click-before.png', fullPage: true });

  // Click the title
  const title = page.locator('text=RegexFlow ECV Explorer').first();
  await title.click();
  await page.waitForTimeout(1000);

  // Screenshot after clicking - should show welcome screen
  await page.screenshot({ path: '../screenshots/title-click-after.png', fullPage: true });

  // Verify welcome screen is visible
  const welcomeText = await page.locator('text=The Challenge').isVisible();
  console.log('Welcome screen visible:', welcomeText);
});
