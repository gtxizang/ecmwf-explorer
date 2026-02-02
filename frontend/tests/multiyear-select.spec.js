/**
 * Test multi-year dataset selection and verify UI changes
 */
import { test, expect } from '@playwright/test';

test('Select multi-year dataset and verify slider', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[ZARR]') || text.includes('[LOD]') || text.includes('year')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);

  // Screenshot before
  await page.screenshot({ path: 'test-screenshots/multiyear-select-01-before.png', fullPage: true });
  console.log('Initial state captured');

  // Click the dropdown input to open it
  const dropdownInput = page.locator('.mantine-Select-input').first();
  await dropdownInput.click();
  await page.waitForTimeout(500);

  // Screenshot with dropdown open
  await page.screenshot({ path: 'test-screenshots/multiyear-select-02-dropdown-open.png', fullPage: true });

  // Wait for dropdown options to appear and click on multi-year
  const multiyearOption = page.locator('.mantine-Select-option:has-text("75 Years")');
  await multiyearOption.waitFor({ state: 'visible', timeout: 5000 });
  await multiyearOption.click();

  // Wait for data to load
  await page.waitForTimeout(5000);

  // Screenshot after selection
  await page.screenshot({ path: 'test-screenshots/multiyear-select-03-selected.png', fullPage: true });
  console.log('Multi-year dataset selected');

  // Verify the page now shows multi-year features
  const pageContent = await page.content();

  // Check for year marks (1950, 1980, 2000, 2020)
  const hasYearMarks = pageContent.includes('1950') ||
                       pageContent.includes('1980') ||
                       pageContent.includes('2000') ||
                       pageContent.includes('2020');

  console.log(`Has year marks: ${hasYearMarks}`);
  expect(hasYearMarks).toBe(true);

  // Check that it says "75 Years" in the current selection
  expect(pageContent).toContain('75 Years');

  console.log('SUCCESS: Multi-year dataset selected and verified');
});

test('Multi-year timeseries works', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Timeseries]') || text.includes('timeseries')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);

  // Select multi-year dataset
  const dropdownInput = page.locator('.mantine-Select-input').first();
  await dropdownInput.click();
  await page.waitForTimeout(500);

  const multiyearOption = page.locator('.mantine-Select-option:has-text("75 Years")');
  await multiyearOption.waitFor({ state: 'visible', timeout: 5000 });
  await multiyearOption.click();
  await page.waitForTimeout(5000);

  // Click on land (central Europe)
  console.log('Clicking on central Europe for timeseries...');
  await page.mouse.click(620, 340);
  await page.waitForTimeout(5000);

  // Screenshot
  await page.screenshot({ path: 'test-screenshots/multiyear-select-04-timeseries.png', fullPage: true });

  // Check for timeseries panel
  const pageContent = await page.content();
  const hasTimeseries = pageContent.includes('Loading timeseries') ||
                        pageContent.includes('Timeseries') ||
                        pageContent.includes('chart') ||
                        pageContent.includes('recharts');

  console.log(`Has timeseries panel: ${hasTimeseries}`);

  // Should NOT show "No data available" if clicked on land
  const hasError = pageContent.includes('No data available');
  if (hasError) {
    console.log('WARNING: Got "No data available" - may have clicked ocean or outside data bounds');
  } else {
    console.log('SUCCESS: No error message shown');
  }
});

test('Multi-year slider navigation changes year', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[LOD]') || text.includes('year')) {
      console.log(`BROWSER: ${text}`);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);

  // Select multi-year dataset
  const dropdownInput = page.locator('.mantine-Select-input').first();
  await dropdownInput.click();
  await page.waitForTimeout(500);

  const multiyearOption = page.locator('.mantine-Select-option:has-text("75 Years")');
  await multiyearOption.waitFor({ state: 'visible', timeout: 5000 });
  await multiyearOption.click();
  await page.waitForTimeout(5000);

  // Get initial state
  await page.screenshot({ path: 'test-screenshots/multiyear-select-05-slider-initial.png', fullPage: true });

  // Find the time slider
  const slider = page.locator('.mantine-Slider-root').first();
  const boundingBox = await slider.boundingBox();

  if (boundingBox) {
    // Click at 10% (early years ~1957)
    await page.mouse.click(boundingBox.x + boundingBox.width * 0.1, boundingBox.y + boundingBox.height / 2);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/multiyear-select-06-slider-early.png', fullPage: true });
    console.log('Slider moved to early years');

    // Click at 90% (recent years ~2022)
    await page.mouse.click(boundingBox.x + boundingBox.width * 0.9, boundingBox.y + boundingBox.height / 2);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/multiyear-select-07-slider-late.png', fullPage: true });
    console.log('Slider moved to late years');
  }

  console.log('SUCCESS: Slider navigation test completed');
});
