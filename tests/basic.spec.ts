import { test, expect } from '@playwright/test';

test.describe('Woodworking Tycoon Basic Functionality', () => {
  test('should load and validate all core functionality', async ({ page }) => {
    const startTime = Date.now();
    
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to the app
    await page.goto('/');

    // Wait for the page to be loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for main content to be present
    await page.waitForSelector('main');

    // Check load time
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(30000);

    // Check that there are no console errors
    expect(consoleErrors).toEqual([]);

    // Check that the page title is correct
    await expect(page).toHaveTitle(/Woodworking Tycoon/);

    // Check that the main layout is present
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Check that the PIXI canvas (shop view) is present
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Check money section displays correctly
    const moneySection = page.locator('p.font-lumberjack').filter({ hasText: '$' });
    await expect(moneySection).toBeVisible();
    
    const moneyText = await moneySection.textContent();
    expect(moneyText).toMatch(/^\$\d+\.\d{2}$/);

    // Ensure the day job button is NOT present (validates our fix)
    const dayJobButton = page.getByRole('button', { name: /day job/i });
    await expect(dayJobButton).not.toBeVisible();
    
    await expect(page.locator('text=Work Day Job')).not.toBeVisible();
  });
});