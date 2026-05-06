import { test, expect } from '@playwright/test';

test.describe('Woodworking Tycoon Basic Functionality', () => {
  test('should load and validate all core functionality', async ({ page }) => {
    const startTime = Date.now();

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await test.step('navigate to app and wait for start menu', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main');
    });

    await test.step('start menu shows and we can start a new game', async () => {
      await expect(page.getByRole('heading', { name: 'Woodworking Tycoon' })).toBeVisible();
      await page.getByRole('button', { name: 'New Game' }).click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
    });

    await test.step('page loads under 30 seconds', async () => {
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(30000);
    });

    await test.step('no console errors during load', async () => {
      expect(consoleErrors).toEqual([]);
    });

    await test.step('page title is correct', async () => {
      await expect(page).toHaveTitle(/Woodworking Tycoon/);
    });

    await test.step('main layout is visible', async () => {
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    await test.step('PIXI canvas (shop view) is visible', async () => {
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    });

    await test.step('money section displays with correct format', async () => {
      const moneySection = page.locator('section').filter({ hasText: 'Balance' }).filter({ hasText: '$' });
      await expect(moneySection).toBeVisible();

      const moneyText = await moneySection.locator('div.font-mono').textContent();
      expect(moneyText).toMatch(/^\$\d+\.\d{2}$/);
    });

    await test.step('day job button is not present', async () => {
      const dayJobButton = page.getByRole('button', { name: /day job/i });
      await expect(dayJobButton).not.toBeVisible();
      await expect(page.locator('text=Work Day Job')).not.toBeVisible();
    });
  });
});
