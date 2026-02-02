/**
 * Full LOD Benchmark - ALL datasets including Polar Sea Ice
 * Reports load times to verify <2s requirement
 */
import { test } from '@playwright/test';

test('Full LOD Benchmark - All Datasets Including Polar', async ({ page }) => {
  const benchmarkResults = [];

  // Capture timer logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[TIMER]') || text.includes('[POLAR]')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Dismiss welcome
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();

  // === SOIL MOISTURE (LOD 0-4) ===
  console.log('\n=== Soil Moisture (LOD 0-4) ===');
  for (let lod = 0; lod <= 4; lod++) {
    const zoom = [1.0, 2.0, 3.5, 5.0, 7.0][lod];
    await page.goto(`http://localhost:5173/?dataset=soil_moisture_multiyear&zoom=${zoom}&lat=50&lon=10`);
    await page.waitForTimeout(3000);

    const timerBadge = page.locator('.mantine-Badge-root').filter({ hasText: /\d+ms|\d+\.\d+s/ }).first();
    let loadTime = 'N/A';
    try {
      if (await timerBadge.isVisible({ timeout: 1000 })) {
        loadTime = await timerBadge.textContent();
      }
    } catch (e) {}

    const timeMs = loadTime.includes('ms') ? parseInt(loadTime) : parseFloat(loadTime) * 1000;
    benchmarkResults.push({ dataset: 'Soil Moisture', lod, zoom, loadTime, pass: timeMs < 2000 });
    console.log(`  LOD ${lod} (zoom ${zoom}): ${loadTime}`);
  }

  // === SOLAR RADIATION (LOD 0-3) ===
  console.log('\n=== Solar Radiation (LOD 0-3) ===');
  for (let lod = 0; lod <= 3; lod++) {
    const zoom = [1.0, 2.0, 3.5, 5.0][lod];
    await page.goto(`http://localhost:5173/?dataset=radiation_budget&zoom=${zoom}&lat=50&lon=10`);
    await page.waitForTimeout(3000);

    const timerBadge = page.locator('.mantine-Badge-root').filter({ hasText: /\d+ms|\d+\.\d+s/ }).first();
    let loadTime = 'N/A';
    try {
      if (await timerBadge.isVisible({ timeout: 1000 })) {
        loadTime = await timerBadge.textContent();
      }
    } catch (e) {}

    const timeMs = loadTime.includes('ms') ? parseInt(loadTime) : parseFloat(loadTime) * 1000;
    benchmarkResults.push({ dataset: 'Solar Radiation', lod, zoom, loadTime, pass: timeMs < 2000 });
    console.log(`  LOD ${lod} (zoom ${zoom}): ${loadTime}`);
  }

  // === FIRE BURNED AREA (LOD 0-4) ===
  console.log('\n=== Fire Burned Area (LOD 0-4) ===');
  for (let lod = 0; lod <= 4; lod++) {
    const zoom = [1.0, 2.0, 3.5, 5.0, 7.0][lod];
    await page.goto(`http://localhost:5173/?dataset=fire_burned_area&zoom=${zoom}&lat=50&lon=10`);
    await page.waitForTimeout(3000);

    const timerBadge = page.locator('.mantine-Badge-root').filter({ hasText: /\d+ms|\d+\.\d+s/ }).first();
    let loadTime = 'N/A';
    try {
      if (await timerBadge.isVisible({ timeout: 1000 })) {
        loadTime = await timerBadge.textContent();
      }
    } catch (e) {}

    const timeMs = loadTime.includes('ms') ? parseInt(loadTime) : parseFloat(loadTime) * 1000;
    benchmarkResults.push({ dataset: 'Fire Burned Area', lod, zoom, loadTime, pass: timeMs < 2000 });
    console.log(`  LOD ${lod} (zoom ${zoom}): ${loadTime}`);
  }

  // === SEA ICE POLAR (LOD 0-3) ===
  console.log('\n=== Sea Ice Polar (LOD 0-3) ===');

  // Sea Ice uses polar view - need to select it via UI
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  await datasetInput.click();
  await page.waitForTimeout(300);
  await page.locator('text=Sea Ice').click();
  await page.waitForTimeout(4000); // Wait for polar view to load

  // Get initial load time
  let polarTimerBadge = page.locator('.mantine-Badge-root').filter({ hasText: /\d+ms|\d+\.\d+s/ }).first();
  let loadTime = 'N/A';
  try {
    if (await polarTimerBadge.isVisible({ timeout: 2000 })) {
      loadTime = await polarTimerBadge.textContent();
    }
  } catch (e) {}

  let timeMs = loadTime.includes('ms') ? parseInt(loadTime) : (loadTime.includes('s') ? parseFloat(loadTime) * 1000 : 9999);
  benchmarkResults.push({ dataset: 'Sea Ice (Polar)', lod: 'initial', zoom: 'auto', loadTime, pass: timeMs < 2000 });
  console.log(`  Initial load: ${loadTime}`);

  // Test different zoom levels for polar (LOD changes)
  const polarZooms = [1, 2, 3, 4];
  for (let i = 0; i < polarZooms.length; i++) {
    const zoom = polarZooms[i];

    // Zoom using mouse wheel on the map
    const mapContainer = page.locator('.leaflet-container').first();
    if (await mapContainer.isVisible()) {
      const box = await mapContainer.boundingBox();
      if (box) {
        // Scroll to zoom
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await page.mouse.wheel(0, zoom < 2 ? 200 : -200);
        await page.waitForTimeout(2000);

        // Get timer
        polarTimerBadge = page.locator('.mantine-Badge-root').filter({ hasText: /\d+ms|\d+\.\d+s/ }).first();
        loadTime = 'N/A';
        try {
          if (await polarTimerBadge.isVisible({ timeout: 1000 })) {
            loadTime = await polarTimerBadge.textContent();
          }
        } catch (e) {}

        timeMs = loadTime.includes('ms') ? parseInt(loadTime) : (loadTime.includes('s') ? parseFloat(loadTime) * 1000 : 9999);
        benchmarkResults.push({ dataset: 'Sea Ice (Polar)', lod: i, zoom: `~${zoom}`, loadTime, pass: timeMs < 2000 });
        console.log(`  LOD ${i} (zoom ~${zoom}): ${loadTime}`);
      }
    }
  }

  // Print final summary
  console.log('\n' + '='.repeat(70));
  console.log('FULL LOD BENCHMARK RESULTS (Including Polar)');
  console.log('='.repeat(70));
  console.log('Dataset              | LOD     | Zoom  | Load Time | <2s');
  console.log('-'.repeat(70));

  for (const r of benchmarkResults) {
    const datasetPad = r.dataset.padEnd(20);
    const lodPad = String(r.lod).padEnd(7);
    const zoomPad = String(r.zoom).padEnd(5);
    const timePad = String(r.loadTime).padEnd(9);
    const passStr = r.pass ? '✓' : '✗';
    console.log(`${datasetPad} | ${lodPad} | ${zoomPad} | ${timePad} | ${passStr}`);
  }

  console.log('='.repeat(70));
  const passes = benchmarkResults.filter(r => r.pass).length;
  const total = benchmarkResults.length;
  console.log(`\nRESULT: ${passes}/${total} loads under 2 seconds`);
});
