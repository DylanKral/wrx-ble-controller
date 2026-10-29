import { expect, test } from "@playwright/test";
import { mockBluetooth } from "./mockBluetooth";
import { durationFactor } from "../../src/animations/timing";

for (const scope of ["global", "per-mode"])
  test(`Velocity: ${scope} slider updates all six modes and keeps the current step`, async ({ page }) => {
    await mockBluetooth(page, true);
    await page.addInitScript(scope => {
      localStorage.setItem("wrx-native-speed-preferences-v1", JSON.stringify({ version: 2, scope, globalSpeed: 129, speeds: { 10: 73 } }));
      localStorage.setItem("wrx-simulator-selected-color-v1", "#22aa44");
    }, scope);
    await page.goto("./");
    await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const button = page.locator('[data-profile-id="velocity-full-spectrum"]');
    await expect(button).toHaveText("Velocity — Full Spectrum");
    await button.click();
    await page.clock.runFor(5500);
    await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "8");
    const before = await page.evaluate(() => window.__ble.writes.length);
    const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
    await slider.fill("75");
    await slider.dispatchEvent("pointerup");
    await page.clock.runFor(1);
    await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "8");
    await expect(page.locator(".sim-readout")).toHaveAttribute("data-native-speed", "192");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!));
    expect(saved.speeds).toEqual(scope === "per-mode" ? { 3: 192, 4: 192, 5: 192, 7: 192, 8: 192, 9: 192, 10: 73 } : { 10: 73 });
    expect(saved.globalSpeed).toBe(scope === "global" ? 192 : 129);
    const modes = [8, 3, 5, 9, 4, 7];
    const cuts = [3200, 2250, 4100, 1000, 2200, 3200];
    for (let i = 0; i < modes.length; i++) {
      await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", String(modes[i]));
      await expect(page.locator(".sim-readout")).toHaveAttribute("data-native-speed", "192");
      await page.clock.runFor(Math.ceil(cuts[i] * durationFactor(modes[i], 192)));
    }
    const packets = await page.evaluate(before => window.__ble.writes.slice(before).filter(w => w.side === "left").map(w => w.hex), before);
    expect(packets.slice(0, 6)).toEqual(modes.map(m => `9E00${(m - 1).toString(16).padStart(2, "0")}C09800E9`.toUpperCase()));
    expect(packets.every(p => p.startsWith("9E") && p.slice(6, 8) === "C0")).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("wrx-simulator-selected-color-v1"))).toBe("#22aa44");
    await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
    const stopped = await page.evaluate(() => window.__ble.writes);
    expect(stopped.slice(-2).map(w => w.hex)).toEqual(["56FF000000F0AA", "56FF000000F0AA"]);
    await page.clock.runFor(20000);
    expect(await page.evaluate(() => window.__ble.writes)).toEqual(stopped);
  });

test("Velocity can be duplicated and simulated through repeat and Stop + Red without BLE writes", async ({ page }) => {
  await mockBluetooth(page, true);
  await page.goto("./#development");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  await page.getByLabel("Playback output", { exact: true }).selectOption("simulation");
  await page.getByLabel("Profile to edit").selectOption("velocity-full-spectrum");
  await expect(page.getByLabel("Profile name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Follow Animation Speed for this profile")).toBeChecked();
  await expect(page.getByLabel("Follow Animation Speed for this profile")).toBeDisabled();
  await page.getByRole("button", { name: "Duplicate profile", exact: true }).click();
  await expect(page.getByLabel("Profile name", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Follow Animation Speed for this profile")).toBeEnabled();
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue("Velocity — Full Spectrum copy");
  await page.reload();
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue("Velocity — Full Spectrum copy");
  await page.getByLabel("Profile to edit").selectOption("velocity-full-spectrum");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator("#dev-editor").getByRole("button", { name: "Play test", exact: true }).click();
  const modes = [4, 7, 8, 3, 5, 9, 4];
  const cuts = [2200, 3200, 3200, 2250, 4100, 1000];
  for (let i = 0; i < modes.length; i++) {
    await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", String(modes[i]));
    if (i < cuts.length) await page.clock.runFor(cuts[i]);
  }
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await page.clock.runFor(20000);
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
});

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
