const { test } = require('@playwright/test');

test('debug fire rendering', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

  await page.goto('http://localhost:5174?dataset=fire_burned_area&year=2020&month=7&lat=5&lon=20&zoom=4');
  await page.waitForTimeout(8000);

  console.log('\n=== BROWSER CONSOLE ===');
  logs.filter(l => l.includes('ZARR') || l.includes('COLORMAP') || l.includes('error') || l.includes('Error')).forEach(l => console.log(l));
  console.log('=======================\n');
});
