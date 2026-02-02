const { test } = require('@playwright/test');

const datasets = [
  { key: 'soil_moisture_multiyear', name: 'Soil Moisture', lat: 50, lon: 10 },
  { key: 'radiation_budget', name: 'Solar Radiation', lat: 50, lon: 10 },
  { key: 'fire_burned_area', name: 'Fire Burned Area', lat: 5, lon: 20 },
  { key: 'sea_ice_polar', name: 'Sea Ice', lat: 75, lon: 0 },
];

test('verify all 4 datasets load correctly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  for (const ds of datasets) {
    console.log(`\nTesting ${ds.name}...`);
    await page.goto(`http://localhost:5174?dataset=${ds.key}&year=2020&month=7&lat=${ds.lat}&lon=${ds.lon}&zoom=4`);
    await page.waitForTimeout(5000);

    // Check for errors
    const dsErrors = errors.filter(e => e.includes('Node not found') || e.includes('Error'));
    if (dsErrors.length > 0) {
      console.log(`  ❌ ${ds.name}: ${dsErrors.join(', ')}`);
    } else {
      console.log(`  ✓ ${ds.name}: OK`);
    }
    errors.length = 0;

    await page.screenshot({ path: `../screenshots/verify-${ds.key}.png`, fullPage: true });
  }
});
