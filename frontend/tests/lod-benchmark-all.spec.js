/**
 * Complete LOD Benchmark - ALL datasets including Polar Sea Ice
 * Reports load times to verify <2s requirement
 */
import { test } from '@playwright/test';

test.setTimeout(180000); // 3 minute timeout

test('Complete LOD Benchmark', async ({ page }) => {
  const results = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[TIMER]') || text.includes('[POLAR TIMER]')) {
      console.log(`BROWSER: ${text}`);
      const match = text.match(/(\d+)ms/);
      if (match) {
        results.push(parseInt(match[1]));
      }
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  const benchmarkData = [];

  // === SOIL MOISTURE (LOD 0-4) ===
  console.log('\n=== Soil Moisture (LOD 0-4) ===');
  const soilZooms = [1.0, 2.0, 3.5, 5.0, 7.0];
  for (let lod = 0; lod <= 4; lod++) {
    await page.goto(`http://localhost:5173/?dataset=soil_moisture_multiyear&zoom=${soilZooms[lod]}&lat=50&lon=10`);
    await page.waitForTimeout(2500);
    const lastTime = results.length > 0 ? results[results.length - 1] : null;
    benchmarkData.push({ dataset: 'Soil Moisture', lod, time: lastTime });
    console.log(`  LOD ${lod}: ${lastTime ? lastTime + 'ms' : 'N/A'}`);
  }

  // === SOLAR RADIATION (LOD 0-3) ===
  console.log('\n=== Solar Radiation (LOD 0-3) ===');
  const solarZooms = [1.0, 2.0, 3.5, 5.0];
  for (let lod = 0; lod <= 3; lod++) {
    await page.goto(`http://localhost:5173/?dataset=radiation_budget&zoom=${solarZooms[lod]}&lat=50&lon=10`);
    await page.waitForTimeout(2500);
    const lastTime = results.length > 0 ? results[results.length - 1] : null;
    benchmarkData.push({ dataset: 'Solar Radiation', lod, time: lastTime });
    console.log(`  LOD ${lod}: ${lastTime ? lastTime + 'ms' : 'N/A'}`);
  }

  // === FIRE BURNED AREA (LOD 0-4) ===
  console.log('\n=== Fire Burned Area (LOD 0-4) ===');
  const fireZooms = [1.0, 2.0, 3.5, 5.0, 7.0];
  for (let lod = 0; lod <= 4; lod++) {
    await page.goto(`http://localhost:5173/?dataset=fire_burned_area&zoom=${fireZooms[lod]}&lat=0&lon=20`);
    await page.waitForTimeout(2500);
    const lastTime = results.length > 0 ? results[results.length - 1] : null;
    benchmarkData.push({ dataset: 'Fire Burned Area', lod, time: lastTime });
    console.log(`  LOD ${lod}: ${lastTime ? lastTime + 'ms' : 'N/A'}`);
  }

  // === SEA ICE POLAR (LOD 0-3) ===
  console.log('\n=== Sea Ice Polar (LOD 0-3) ===');

  // Sea ice needs to be selected via UI (triggers polar view switch)
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  await page.getByText('Explore Data').click();
  await page.waitForTimeout(1000);

  const datasetInput = page.locator('input[aria-haspopup="listbox"]').first();
  await datasetInput.click();
  await page.waitForTimeout(300);
  await page.locator('text=Sea Ice').click();
  await page.waitForTimeout(3000);

  // Get initial polar load time
  let polarTime = results.length > 0 ? results[results.length - 1] : null;
  benchmarkData.push({ dataset: 'Sea Ice (Polar)', lod: 'init', time: polarTime });
  console.log(`  Initial: ${polarTime ? polarTime + 'ms' : 'N/A'}`);

  // Test different zoom levels via mouse wheel
  const mapContainer = page.locator('.leaflet-container').first();
  if (await mapContainer.isVisible()) {
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width/2, box.y + box.height/2);

      // Zoom out (LOD 0)
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(2500);
      polarTime = results.length > 0 ? results[results.length - 1] : null;
      benchmarkData.push({ dataset: 'Sea Ice (Polar)', lod: 0, time: polarTime });
      console.log(`  LOD 0: ${polarTime ? polarTime + 'ms' : 'N/A'}`);

      // Zoom in (LOD 2)
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(2500);
      polarTime = results.length > 0 ? results[results.length - 1] : null;
      benchmarkData.push({ dataset: 'Sea Ice (Polar)', lod: 2, time: polarTime });
      console.log(`  LOD 2: ${polarTime ? polarTime + 'ms' : 'N/A'}`);

      // Zoom in more (LOD 3)
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(2500);
      polarTime = results.length > 0 ? results[results.length - 1] : null;
      benchmarkData.push({ dataset: 'Sea Ice (Polar)', lod: 3, time: polarTime });
      console.log(`  LOD 3: ${polarTime ? polarTime + 'ms' : 'N/A'}`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE LOD BENCHMARK RESULTS');
  console.log('='.repeat(60));
  console.log('Dataset              | LOD  | Load Time | <2s');
  console.log('-'.repeat(60));

  let passes = 0;
  let total = 0;
  for (const r of benchmarkData) {
    const pass = r.time !== null && r.time < 2000;
    if (r.time !== null) {
      total++;
      if (pass) passes++;
    }
    const datasetPad = r.dataset.padEnd(20);
    const lodPad = String(r.lod).padEnd(4);
    const timePad = r.time !== null ? `${r.time}ms`.padEnd(9) : 'N/A'.padEnd(9);
    const passStr = r.time !== null ? (pass ? '✓' : '✗') : '?';
    console.log(`${datasetPad} | ${lodPad} | ${timePad} | ${passStr}`);
  }

  console.log('='.repeat(60));
  console.log(`RESULT: ${passes}/${total} loads under 2 seconds`);
});
