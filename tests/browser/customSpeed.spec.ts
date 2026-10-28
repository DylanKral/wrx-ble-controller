import { expect, test } from "@playwright/test";
import { mockBluetooth } from "./mockBluetooth";

for (const scope of ["global", "per-mode"])
  for (const stepIndex of [0, 1, 2, 3, 4])
    test(`${scope}: personal preset speed at step ${stepIndex} updates all modes once`, async ({ page }) => {
      await mockBluetooth(page, true);
      await page.addInitScript(scope => {
        localStorage.setItem("wrx-native-speed-preferences-v1", JSON.stringify({ version: 2, scope, globalSpeed: 129, speeds: { 4: 73, 7: 129, 8: 201 }, bundledFollow: false }));
        localStorage.setItem("wrx-dream-studio-v7", JSON.stringify({ version: 9, selectedId: "personal", profiles: [{ id: "personal", name: "Personal mixed", repeat: true, experimental: false, steps: [
          { type: "mode", mode: 7, ms: 1000 }, { type: "color", color: "#0000ff", ms: 1000 },
          { type: "mode", mode: 8, ms: 1000 }, { type: "wait", ms: 1000 }, { type: "mode", mode: 7, ms: 1000 },
        ] }], buttons: [{ id: "personal-button", label: "Personal mixed", profileId: "personal" }] }));
      }, scope);
      await page.goto("./");
      await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.locator('[data-profile-id="personal"]').click();
      if (scope === "per-mode") await expect(page.getByTestId("selected-speed")).toHaveText("Mixed speeds");
      await page.clock.runFor(stepIndex * 1000 + 100);
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        (window as any).__speedSaves = 0;
        Storage.prototype.setItem = function(key, value) {
          if (key === "wrx-native-speed-preferences-v1") (window as any).__speedSaves++;
          original.call(this, key, value);
        };
      });
      const before = await page.evaluate(() => window.__ble.writes.length);
      const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
      for (const value of ["60", "90", "75"]) await slider.fill(value);
      await slider.dispatchEvent("pointerup");
      await page.clock.runFor(1);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!));
      expect(saved.speeds).toEqual(scope === "per-mode" ? { 4: 73, 7: 192, 8: 192 } : { 4: 73, 7: 129, 8: 201 });
      expect(saved.globalSpeed).toBe(scope === "global" ? 192 : 129);
      expect(await page.evaluate(() => (window as any).__speedSaves)).toBe(1);
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before + ([1, 3].includes(stepIndex) ? 0 : 2));
      await page.clock.runFor(5100);
      const future = await page.evaluate(before => window.__ble.writes.slice(before).filter(w => w.hex.startsWith("9E")), before);
      expect(future.length).toBeGreaterThan(0);
      expect(future.every(w => w.hex.slice(6, 8) === "C0")).toBe(true);
      await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!))).toEqual(saved);
    });

test("switching profiles cancels a pending speed gesture", async ({ page }) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await page.getByRole("slider", { name: "Animation speed", exact: true }).fill("90");
  await page.locator('[data-profile-id="chase-rainbow"]').click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => localStorage.getItem("wrx-native-speed-preferences-v1"))).toBeNull();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-native-speed", "129");
});
