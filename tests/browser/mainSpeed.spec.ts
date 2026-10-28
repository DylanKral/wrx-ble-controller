import { expect, test } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";
import { durationFactor } from "../../src/animations/timing";

test("Main speed saves automatically, exposes nine stops and no confirmation or technical preview", async ({ page }) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  const speed = page.getByRole("slider", { name: "Animation speed", exact: true });
  await expect(speed).toHaveValue("50");
  await expect(speed).toHaveAttribute("aria-valuetext", "50% slider position, default");
  await expect(page.getByTestId("selected-speed")).toHaveText("50% · Default");
  expect(await speed.evaluate(el => el.parentElement!.querySelectorAll('option').length)).toBe(9);
  await expect(page.getByRole("button", { name: /Apply speed|Save speed/i })).toHaveCount(0);
  await expect(page.locator("#home-view .sim-tools, #home-view .sim-led-grid")).toHaveCount(0);
  await expect(page.getByLabel("Animation preview", { exact: true })).not.toContainText(/frame|0x|timing|capture/i);
  const preview = (await page.locator(".sim-compact").boundingBox())!;
  const tabs = (await page.locator(".home-tabs").boundingBox())!;
  expect(preview.y + preview.height).toBeLessThan(tabs.y);
  await speed.fill("30");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1") || "{}").globalSpeed)).toBe(78);
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
  await page.reload();
  await expect(speed).toHaveValue("30");
  await speed.press("End");
  await expect(speed).toHaveValue("100");
  await speed.press("Home");
  await expect(speed).toHaveValue("0");
  for (let i = 0; i < 4; i++) await speed.press("ArrowRight");
  await expect(speed).toHaveValue("50");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!).globalSpeed)).toBe(129);
  // Screen readers may change a native range without sending key events.
  await speed.fill("51");
  await expect(speed).toHaveValue("60");
  await speed.dispatchEvent("pointerup");
  await speed.fill("59");
  await expect(speed).toHaveValue("50");
  await speed.dispatchEvent("pointerup");
  const automatic = page.getByRole("checkbox", { name: "Automatically adjust preset cut timing", exact: true });
  await automatic.uncheck();
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await expect(automatic).toHaveCount(0);
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  await expect(automatic).not.toBeChecked();
});

for (const output of ["simulation", "hardware", "combined"])
  for (const preset of ["basic", "custom"])
    test(`${output}: automatic ${preset} speed coalesces, rebases cut timing and cancels on Stop + Red`, async ({ page }) => {
      await mockBluetooth(page, true);
      await page.goto("./");
      await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
      await page.getByLabel("Playback output", { exact: true }).selectOption(output);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.getByRole("tab", { name: preset === "basic" ? "Basic" : "Custom", exact: true }).click();
      await page.locator(`[data-profile-id="${preset === "basic" ? "basic-4" : "overlap-cut"}"]`).click();
      const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
      const before = await page.evaluate(() => window.__ble.writes.length);
      // One commit for a burst, including duplicate selections of the same stop.
      for (const p of [0, 15, 30, 45, 60, 75, 75]) await slider.fill(String(p));
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before);
      await page.clock.runFor(179);
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before);
      await page.clock.runFor(2);
      await slider.dispatchEvent("pointerup");
      await slider.dispatchEvent("pointerup");
      const mode = preset === "basic" ? 4 : 7;
      if (output === "simulation") expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
      else {
        const writes = await page.evaluate(() => window.__ble.writes);
        expect(writes.slice(-2).map(w => w.hex)).toEqual([0, 1].map(() => `9E00${(mode-1).toString(16).padStart(2,"0")}C09800E9`.toUpperCase()));
        expect(writes.length).toBe(before + 2);
      }
      if (output === "hardware") await expect(page.locator(".sim-art")).toHaveCount(0);
      else await expect(page.locator(".sim-readout")).toHaveAttribute("data-native-speed", "192");
      const duration = (preset === "basic" ? 2200 : 1300) * durationFactor(mode, 192);
      await page.clock.runFor(Math.floor(duration) - 3);
      await expect(page.locator(".global-playbar")).toHaveAttribute("data-mode", String(mode));
      await page.clock.runFor(5);
      await expect(page.locator(".global-playbar")).toHaveAttribute("data-mode", String(preset === "basic" ? 4 : 8));
      if (output !== "simulation") {
        const next = preset === "basic" ? "9E0003C09800E9" : "9E0007C09800E9";
        expect(await page.evaluate(() => window.__ble.writes.slice(-2).map(w => w.hex))).toEqual([next, next]);
      }
      await slider.fill("90");
      await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
      const stopped = await page.evaluate(() => window.__ble.writes.length);
      await page.clock.runFor(5000);
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(stopped);
      if (output !== "simulation") expect(await page.evaluate(() => window.__ble.writes.slice(-2).map(w => w.hex))).toEqual(["56FF000000F0AA", "56FF000000F0AA"]);
    });

test("exact preferences survive rendering and per-mode selection commits to the whole running preset", async ({ page }) => {
  await mockBluetooth(page, true);
  const original = { version: 2, scope: "per-mode", globalSpeed: 201, speeds: { 4: 73, 7: 129, 8: 129 }, corrections: { 4: 1.25, 8: 1.5 }, bundledFollow: true, previewTiming: { 4: true } };
  await page.addInitScript(value => { if (!localStorage.getItem("seed")) { localStorage.setItem("seed", "yes"); localStorage.setItem("wrx-native-speed-preferences-v1", JSON.stringify(value)); } }, original);
  await page.goto("./");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!))).toEqual(original);
  await page.reload();
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!))).toEqual(original);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await page.clock.runFor(1200);
  const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
  await slider.fill("75");
  await page.clock.runFor(100); // Move to Mode 8 before committing.
  await slider.dispatchEvent("pointerup");
  await page.clock.runFor(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!))).toMatchObject({ ...original, speeds: { 4: 73, 7: 192, 8: 192 } });
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await navigate(page, "Custom Testing");
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(page.getByLabel("Native speed byte", { exact: true })).toHaveValue("73");
});

for (const type of ["color", "wait"])
  test(`speed during ${type} saves for subsequent modes without interrupting the step`, async ({ page }) => {
    await mockBluetooth(page, true);
    await page.addInitScript(type => localStorage.setItem("wrx-dream-studio-v7", JSON.stringify({ version: 9, selectedId: "test-step", profiles: [{ id: "test-step", name: "Step test", repeat: false, experimental: false, steps: [type === "color" ? { type: "color", color: "#0000ff", ms: 1000 } : { type: "wait", ms: 1000 }, { type: "mode", mode: 8, ms: 1300 }] }], buttons: [{ id: "test-button", label: "Step test", profileId: "test-step" }] })), type);
    await page.goto("./");
    await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('[data-profile-id="test-step"]').click();
    const before = await page.evaluate(() => window.__ble.writes.length);
    await page.getByRole("slider", { name: "Animation speed", exact: true }).fill("90");
    await page.clock.runFor(999);
    expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before);
    await page.clock.runFor(1);
    expect(await page.evaluate(() => window.__ble.writes.slice(-2).map(w => w.hex))).toEqual(["9E0007E69800E9", "9E0007E69800E9"]);
  });

test("touch-style drag and held keys commit once, cancellation discards a draft, and native loops stay single-dispatch", async ({ page }) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-5"]').click();
  const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .75, box.y + box.height / 2, { steps: 12 });
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(2);
  await page.mouse.up();
  await page.clock.runFor(1);
  await expect(slider).toHaveValue("75");
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(4);
  await slider.fill("90");
  await slider.dispatchEvent("pointercancel");
  await slider.dispatchEvent("pointerup");
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(4);
  await slider.focus();
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("ArrowLeft");
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(4);
  await page.keyboard.up("ArrowLeft");
  await page.clock.runFor(1);
  await expect(slider).toHaveValue("50");
  expect(await page.evaluate(() => window.__ble.writes.slice(-2).map(w => w.hex))).toEqual(["9E0004819800E9", "9E0004819800E9"]);
  const count = await page.evaluate(() => window.__ble.writes.length);
  await page.clock.runFor(10000);
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(count);
});
