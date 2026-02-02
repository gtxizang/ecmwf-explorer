const { test } = require('@playwright/test');

test('verify radiation dataset loads', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

  // Load radiation dataset directly via URL
  await page.goto('http://localhost:5174?dataset=radiation_budget&year=2020&month=7&lat=50&lon=10&zoom=4');
  await page.waitForTimeout(8000);

  console.log('\n=== RADIATION TEST ===');
  logs.filter(l => l.includes('ZARR') || l.includes('error') || l.includes('Error') || l.includes('Node not found')).forEach(l => console.log(l));
  console.log('======================\n');

  await page.screenshot({ path: '../screenshots/test-radiation-now.png', fullPage: true });
});
