const { test } = require('@playwright/test');

test('compare fire vs soil', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  // Test soil moisture first (works)
  await page.goto('http://localhost:5174?dataset=soil_moisture_multiyear&year=2020&month=7&lat=5&lon=20&zoom=4');
  await page.waitForTimeout(6000);

  console.log('\n=== SOIL MOISTURE ===');
  logs.filter(l => l.includes('ZARR')).forEach(l => console.log(l));
  logs.length = 0;

  // Now test fire
  await page.goto('http://localhost:5174?dataset=fire_burned_area&year=2020&month=7&lat=5&lon=20&zoom=4');
  await page.waitForTimeout(6000);

  console.log('\n=== FIRE ===');
  logs.filter(l => l.includes('ZARR')).forEach(l => console.log(l));
});
