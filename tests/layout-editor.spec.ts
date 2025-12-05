import { test, expect } from "@playwright/test";

test.describe("Layout Editor", () => {
  test("should handle complete layout editor workflow", async ({ page }) => {
    // Navigate to the game
    await page.goto("http://localhost:3002");

    // Wait for game to load
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500); // Give PIXI time to initialize

    // ==================== SETUP: Load fixture with miter saw in storage ====================
    console.log("Loading fixture with miter saw in storage");
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      const updateGameState = (window as any).__UPDATE_GAME_STATE__;
      updateGameState(() => fixtures["layout-with-miter-saw-in-storage"]);
    });
    await page.waitForTimeout(300);

    // Navigate to layout page
    await page.getByText("Shop Layout").click();
    await page.waitForTimeout(500);

    // Verify we're on the layout page
    await expect(page.getByText("Layout Editor")).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Storage', level: 3 })).toBeVisible();

    // ==================== TEST 1: Place machine from storage ====================
    console.log("Test 1: Place machine from storage");

    // Verify miter saw is in storage
    await expect(page.getByText("Miter Saw")).toBeVisible();

    // Click Place button
    await page.click('button:has-text("Place")');
    await page.waitForTimeout(200);

    // Verify placement mode is active
    await expect(page.getByText("Placing Machine")).toBeVisible();

    // Get game state to find valid placement location
    const validCell = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      // Find a free cell that's not occupied
      return [0, 2]; // Known free cell for testing
    });

    // Click on canvas to place machine (rough click near cell)
    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x: 128 * validCell[0] + 64, y: 128 * validCell[1] + 64 } });
    await page.waitForTimeout(300);

    // Verify machine was placed
    const placedSuccessfully = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      // Check if miter saw is no longer in storage
      const inStorage = gameState.storage.machines.includes("miterSaw");
      // Check if there's a miter saw in machines
      const placed = gameState.machines.some((m: any) => m.machineTypeId === "miterSaw");
      return !inStorage && placed;
    });
    expect(placedSuccessfully).toBe(true);

    // Verify back to normal mode
    await expect(page.getByText("Select or Place")).toBeVisible();

    // ==================== TEST 2: Rotate during placement ====================
    console.log("Test 2: Rotate during placement");

    // Reload fixture to reset state with miter saw
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      const updateGameState = (window as any).__UPDATE_GAME_STATE__;
      updateGameState(() => fixtures["layout-with-miter-saw-in-storage"]);
    });
    await page.waitForTimeout(300);

    // Click Place on miter saw
    await page.click('button:has-text("Place")');
    await page.waitForTimeout(200);

    // Press R to rotate
    await page.keyboard.press("r");
    await page.waitForTimeout(100);

    // Press R again to rotate more
    await page.keyboard.press("r");
    await page.waitForTimeout(100);

    // Press ESC to cancel
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Verify placement cancelled and machine still in storage
    await expect(page.getByText("Select or Place")).toBeVisible();
    const stillInStorage = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      return gameState.storage.machines.includes("miterSaw");
    });
    expect(stillInStorage).toBe(true);

    // ==================== TEST 3: Select and move a machine ====================
    console.log("Test 3: Select and move a machine");

    // Load fixture with placed machines
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      const updateGameState = (window as any).__UPDATE_GAME_STATE__;
      updateGameState(() => fixtures["layout-with-placed-machines"]);
    });
    await page.waitForTimeout(500);

    // Verify we're still on layout page and it's visible
    await expect(page.getByText("Layout Editor")).toBeVisible();

    // Clear any lingering UI state
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.getByText("Select or Place")).toBeVisible();

    // Re-query canvas after fixture load
    const canvas3 = page.locator('canvas').first();

    // Get position of a miter saw from the fixture
    const miterSawPos = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const machine = gameState.machines.find((m: any) => m.machineTypeId === "miterSaw");
      return machine?.position;
    });

    // Click on the miter saw to select it
    const clickX = 128 * miterSawPos[0] + 64;
    const clickY = 128 * miterSawPos[1] + 64;
    await canvas3.click({ position: { x: clickX, y: clickY }, force: true });
    await page.waitForTimeout(500);

    // Verify move mode is active
    await expect(page.getByText("Moving Machine")).toBeVisible();
    await expect(page.getByText("Moving: Miter Saw")).toBeVisible();

    // Move to a new location
    const newPos = [1, 3];
    await canvas3.click({ position: { x: 128 * newPos[0] + 64, y: 128 * newPos[1] + 64 } });
    await page.waitForTimeout(500);

    // Verify machine moved
    const movedSuccessfully = await page.evaluate((newPosition) => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const miterSaw = gameState.machines.find((m: any) => m.machineTypeId === "miterSaw");
      return miterSaw && miterSaw.position[0] === newPosition[0] && miterSaw.position[1] === newPosition[1];
    }, newPos);
    expect(movedSuccessfully).toBe(true);

    // ==================== TEST 4: Rotate during move ====================
    console.log("Test 4: Rotate during move");

    // Select the miter saw again
    await canvas3.click({ position: { x: 128 * newPos[0] + 64, y: 128 * newPos[1] + 64 } });
    await page.waitForTimeout(300);

    // Press R to rotate
    const originalRotation = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const miterSaw = gameState.machines.find((m: any) => m.machineTypeId === "miterSaw");
      return miterSaw.rotation;
    });

    await page.keyboard.press("r");
    await page.waitForTimeout(100);

    // Move to same position (rotation-only move)
    await canvas3.click({ position: { x: 128 * newPos[0] + 64, y: 128 * newPos[1] + 64 } });
    await page.waitForTimeout(300);

    // Verify rotation changed
    const newRotation = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const miterSaw = gameState.machines.find((m: any) => m.machineTypeId === "miterSaw");
      return miterSaw.rotation;
    });
    expect(newRotation).toBe((originalRotation + 1) % 4);

    // ==================== TEST 5: Delete machine ====================
    console.log("Test 5: Delete machine");

    // Select the miter saw
    await canvas3.click({ position: { x: 128 * newPos[0] + 64, y: 128 * newPos[1] + 64 } });
    await page.waitForTimeout(300);

    // Press Delete to remove
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Verify machine returned to storage
    const returnedToStorage = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const inStorage = gameState.storage.machines.includes("miterSaw");
      const placed = gameState.machines.some((m: any) => m.machineTypeId === "miterSaw");
      return inStorage && !placed;
    });
    expect(returnedToStorage).toBe(true);

    // ==================== TEST 6: Materials dropped when moving/deleting ====================
    console.log("Test 6: Materials dropped when moving");

    // Load fixture with machine that has materials
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      const updateGameState = (window as any).__UPDATE_GAME_STATE__;
      updateGameState(() => fixtures["layout-with-placed-machines"]);
    });
    await page.waitForTimeout(300);

    // Find machine with materials (miter saw at [2,4])
    const machineWithMaterials = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      return gameState.machines.find((m: any) =>
        m.machineTypeId === "miterSaw" && m.inputMaterials.length > 0
      );
    });
    expect(machineWithMaterials).toBeTruthy();

    const oldPos = machineWithMaterials.position;
    const materialCount = machineWithMaterials.inputMaterials.length;

    // Re-query canvas after fixture reload
    const canvas6 = page.locator('canvas').first();

    // Select and move the machine
    await canvas6.click({ position: { x: 128 * oldPos[0] + 64, y: 128 * oldPos[1] + 64 } });
    await page.waitForTimeout(300);

    const newPosForMaterialTest = [0, 3];
    await canvas6.click({ position: { x: 128 * newPosForMaterialTest[0] + 64, y: 128 * newPosForMaterialTest[1] + 64 } });
    await page.waitForTimeout(300);

    // Verify materials were dropped at old position
    const materialsDropped = await page.evaluate(({ oldPosition, expectedCount }: any) => {
      const gameState = (window as any).__GET_GAME_STATE__();
      const pilesAtOldPos = gameState.materialPiles.filter((pile: any) =>
        pile.position[0] === oldPosition[0] && pile.position[1] === oldPosition[1]
      );
      return pilesAtOldPos.length === expectedCount;
    }, { oldPosition: oldPos, expectedCount: materialCount });
    expect(materialsDropped).toBe(true);

    // ==================== TEST 7: Toggle selection by clicking selected machine ====================
    console.log("Test 7: Toggle selection");

    // Select a machine
    const anyMachine = await page.evaluate(() => {
      const gameState = (window as any).__GET_GAME_STATE__();
      return gameState.machines[0];
    });

    await canvas6.click({ position: { x: 128 * anyMachine.position[0] + 64, y: 128 * anyMachine.position[1] + 64 } });
    await page.waitForTimeout(300);
    await expect(page.getByText("Moving Machine")).toBeVisible();

    // Click same machine again to deselect
    await canvas6.click({ position: { x: 128 * anyMachine.position[0] + 64, y: 128 * anyMachine.position[1] + 64 } });
    await page.waitForTimeout(300);
    await expect(page.getByText("Select or Place")).toBeVisible();

    // ==================== TEST 8: ESC cancels selection/placement ====================
    console.log("Test 8: ESC cancels modes");

    // Select a machine
    await canvas6.click({ position: { x: 128 * anyMachine.position[0] + 64, y: 128 * anyMachine.position[1] + 64 } });
    await page.waitForTimeout(300);
    await expect(page.getByText("Moving Machine")).toBeVisible();

    // Press ESC
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.getByText("Select or Place")).toBeVisible();

    console.log("All layout editor tests passed!");
  });
});
