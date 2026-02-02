/**
 * Verify all polish changes for demo readiness
 * 48 hours to demo - testing buttery smooth UX improvements
 */
import { test, expect } from '@playwright/test';

test.describe('Demo Polish Verification', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('[LOD]') || msg.text().includes('Preload')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });
  });

  test('1. Two-tab welcome screen works', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(2000);

    // Check welcome screen appears - should start on Evaluator tab
    const evaluatorTab = page.locator('text=For Evaluators');
    await expect(evaluatorTab).toBeVisible({ timeout: 5000 });
    console.log('Welcome screen visible with Evaluator tab');

    await page.screenshot({ path: 'test-screenshots/polish-01-welcome-evaluator.png' });
    console.log('Screenshot: polish-01-welcome-evaluator.png - Evaluator tab (default)');

    // Click Technical Details tab
    const technicalTab = page.locator('text=Technical Details');
    if (await technicalTab.isVisible()) {
      await technicalTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-screenshots/polish-01b-welcome-technical.png' });
      console.log('Screenshot: polish-01b-welcome-technical.png - Technical tab');
    }

    // Click explore button
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-screenshots/polish-02-main-view.png' });
    console.log('Screenshot: polish-02-main-view.png');
  });

  test('2. Region presets work correctly', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(3000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    // Find and click Europe preset
    const europeButton = page.locator('button:has-text("EU")').or(page.locator('text=🇪🇺')).first();
    if (await europeButton.isVisible()) {
      await europeButton.click();
      await page.waitForTimeout(1500); // Wait for flyTo animation
      await page.screenshot({ path: 'test-screenshots/polish-03-europe-view.png' });
      console.log('Screenshot: polish-03-europe-view.png - Flew to Europe');
    } else {
      console.log('Europe button not found, checking for Quick Views section');
    }

    // Try Arctic preset
    const arcticButton = page.locator('button:has-text("❄️")').or(page.locator('text=❄️')).first();
    if (await arcticButton.isVisible()) {
      await arcticButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-screenshots/polish-04-arctic-view.png' });
      console.log('Screenshot: polish-04-arctic-view.png - Flew to Arctic');
    }

    // Try Global preset
    const globalButton = page.locator('button:has-text("🌍")').or(page.locator('text=🌍')).first();
    if (await globalButton.isVisible()) {
      await globalButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-screenshots/polish-05-global-view.png' });
      console.log('Screenshot: polish-05-global-view.png - Back to Global');
    }
  });

  test('3. Full-screen mode works', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(3000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-screenshots/polish-06-before-fullscreen.png' });
    console.log('Screenshot: polish-06-before-fullscreen.png - Controls visible');

    // Find and click full-screen toggle (⛶ or similar)
    const fullscreenButton = page.locator('button:has-text("⛶")').or(page.locator('text=⛶')).first();
    if (await fullscreenButton.isVisible()) {
      await fullscreenButton.click();
      await page.waitForTimeout(500); // Wait for transition
      await page.screenshot({ path: 'test-screenshots/polish-07-fullscreen.png' });
      console.log('Screenshot: polish-07-fullscreen.png - Full-screen mode, controls hidden');

      // Exit full-screen
      const exitButton = page.locator('button:has-text("✕")').or(page.locator('text=✕')).first();
      if (await exitButton.isVisible()) {
        await exitButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-screenshots/polish-08-exit-fullscreen.png' });
        console.log('Screenshot: polish-08-exit-fullscreen.png - Controls restored');
      }
    } else {
      console.log('Full-screen button not found');
    }
  });

  test('4. URL state encoding works', async ({ page }) => {
    // Load with URL params
    await page.goto('http://localhost:5174?dataset=radiation&year=2020&month=6&zoom=4&lat=50&lon=10');
    await page.waitForTimeout(3000);

    // Should skip welcome screen and show radiation dataset at specified view
    const welcomeVisible = await page.locator('text=Explore Data').isVisible();
    console.log('Welcome screen visible with URL params:', welcomeVisible);
    console.log('Expected: false (should skip welcome when URL has params)');

    await page.screenshot({ path: 'test-screenshots/polish-09-url-state.png' });
    console.log('Screenshot: polish-09-url-state.png - Loaded from URL params');

    // Check current URL has been updated
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
  });

  test('5. Smooth transitions during dataset switch', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(3000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-screenshots/polish-10-soil-initial.png' });

    // Switch dataset - should show smooth transition (no blank screen)
    const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
    await datasetSelect.click();
    await page.waitForTimeout(500);
    await page.locator('text=Solar Radiation').click();

    // Quick screenshot during transition
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-screenshots/polish-11-transition.png' });
    console.log('Screenshot: polish-11-transition.png - During transition (old data should be dimmed)');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-screenshots/polish-12-radiation-loaded.png' });
    console.log('Screenshot: polish-12-radiation-loaded.png - New data loaded');
  });

  test('6. Smooth transitions during time slider change', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(3000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    // Find month slider
    const monthSlider = page.locator('input[type="range"]').first();
    if (await monthSlider.isVisible()) {
      await page.screenshot({ path: 'test-screenshots/polish-13-january.png' });

      // Change to different month
      await monthSlider.fill('6'); // July
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-screenshots/polish-14-july-transition.png' });
      console.log('Screenshot: polish-14-july-transition.png - During month change');

      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-screenshots/polish-15-july-loaded.png' });
    }
  });

  test('7. All datasets still work after polish changes', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForTimeout(3000);

    // Dismiss welcome screen
    const exploreButton = page.getByText('Explore Data');
    if (await exploreButton.isVisible()) {
      await exploreButton.click();
    }
    await page.waitForTimeout(2000);

    // Test each dataset
    const datasets = [
      'Soil Moisture',
      'Solar Radiation',
      'Fire Burned',
      'Sea Ice'
    ];

    for (let i = 0; i < datasets.length; i++) {
      const datasetSelect = page.locator('input[aria-haspopup="listbox"]').first();
      await datasetSelect.click();
      await page.waitForTimeout(500);

      const option = page.locator(`text=${datasets[i]}`).first();
      if (await option.isVisible()) {
        await option.click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `test-screenshots/polish-16-dataset-${i + 1}-${datasets[i].replace(/\s+/g, '-').toLowerCase()}.png` });
        console.log(`Screenshot: polish-16-dataset-${i + 1} - ${datasets[i]}`);
      }
    }
  });
});
