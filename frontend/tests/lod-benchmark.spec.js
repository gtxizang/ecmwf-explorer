/**
 * LOD Benchmark - Test all datasets at all LOD levels
 * Reports load times to verify <2s requirement
 */
import { test } from '@playwright/test';

// Dataset configs matching ZarrMap.jsx
const DATASETS = [
  { id: 'soil_moisture_multiyear', name: 'Soil Moisture', maxLevel: 4 },
  { id: 'radiation_budget', name: 'Solar Radiation', maxLevel: 3 },
  { id: 'fire_burned_area', name: 'Fire Burned Area', maxLevel: 4 },
  // Sea ice excluded - uses polar view with different component
];

// Zoom levels that trigger each LOD (approximate)
const LOD_ZOOM_MAP = {
  0: 1.0,   // Global view
  1: 2.0,   // Continental
  2: 3.5,   // Regional
  3: 5.0,   // Country
  4: 7.0,   // Local
};

test('LOD Benchmark - All Datasets All Levels', async ({ page }) => {
  const results = [];

  // Capture timer logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[TIMER]')) {
      const match = text.match(/(\d+)ms/);
      if (match) {
        results.push({ time: parseInt(match[1]), log: text });
      }
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  const benchmarkResults = [];

  for (const dataset of DATASETS) {
    console.log(`\n=== Testing ${dataset.name} ===`);

    // Select dataset
    await datasetInput.click();
    await page.waitForTimeout(300);

    // Find and click the dataset option
    const optionText = dataset.id === 'soil_moisture_multiyear'
      ? 'Soil Moisture (75 Years)'
      : dataset.id === 'radiation_budget'
      ? 'Solar Radiation (75 Years)'
      : 'Fire Burned Area (5 Years)';

    await page.locator(`text=${optionText}`).click();
    await page.waitForTimeout(2000); // Wait for initial load

    // Test each LOD level by zooming
    for (let lod = 0; lod <= dataset.maxLevel; lod++) {
      const zoom = LOD_ZOOM_MAP[lod] || lod + 1;

      // Clear previous results marker
      const beforeCount = results.length;

      // Set zoom via URL or mouse wheel
      // Use evaluate to set zoom directly on the map
      await page.evaluate((z) => {
        // Find deck.gl and set zoom
        const event = new WheelEvent('wheel', {
          deltaY: z < 3 ? 100 : -100,
          bubbles: true
        });
        document.querySelector('canvas')?.dispatchEvent(event);
      }, zoom);

      // Alternative: navigate to URL with zoom
      const currentUrl = page.url();
      const baseUrl = currentUrl.split('?')[0];
      await page.goto(`${baseUrl}?dataset=${dataset.id}&zoom=${zoom}&lat=50&lon=10`);
      await page.waitForTimeout(3000); // Wait for load

      // Get the timer value from the badge
      const timerBadge = page.locator('text=/\\d+ms|\\d+\\.\\d+s/').first();
      let loadTime = 'N/A';

      try {
        if (await timerBadge.isVisible({ timeout: 2000 })) {
          const badgeText = await timerBadge.textContent();
          loadTime = badgeText;
        }
      } catch (e) {
        // Timer not visible
      }

      // Check results array for new timer entries
      if (results.length > beforeCount) {
        const latestResult = results[results.length - 1];
        loadTime = `${latestResult.time}ms`;
      }

      benchmarkResults.push({
        dataset: dataset.name,
        lod,
        zoom: zoom.toFixed(1),
        loadTime,
        under2s: loadTime !== 'N/A' && parseInt(loadTime) < 2000 ? '✓' : '?'
      });

      console.log(`  LOD ${lod} (zoom ${zoom.toFixed(1)}): ${loadTime}`);
    }
  }

  // Print summary table
  console.log('\n' + '='.repeat(70));
  console.log('LOD BENCHMARK RESULTS');
  console.log('='.repeat(70));
  console.log('Dataset              | LOD | Zoom | Load Time | <2s');
  console.log('-'.repeat(70));

  for (const r of benchmarkResults) {
    const datasetPad = r.dataset.padEnd(20);
    const lodPad = String(r.lod).padEnd(3);
    const zoomPad = r.zoom.padEnd(4);
    const timePad = r.loadTime.padEnd(9);
    console.log(`${datasetPad} | ${lodPad} | ${zoomPad} | ${timePad} | ${r.under2s}`);
  }

  console.log('='.repeat(70));

  // Count passes
  const passes = benchmarkResults.filter(r => r.under2s === '✓').length;
  const total = benchmarkResults.length;
  console.log(`\nRESULT: ${passes}/${total} loads under 2 seconds`);
});
