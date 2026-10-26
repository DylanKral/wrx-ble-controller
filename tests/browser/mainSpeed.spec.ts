import { expect, test } from "@playwright/test";
import { mockBluetooth } from "./mockBluetooth";
import { durationFactor } from "../../src/animations/timing";

test("Main keeps one visible speed control directly below both tabs, with reference and Custom timing preference", async ({
  page,
}, info) => {
  await mockBluetooth(page, true);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  const speed = page.getByRole("slider", {
    name: "Animation speed",
    exact: true,
  });
  const controls = page.getByRole("group", {
    name: "Animation speed controls",
    exact: true,
  });
  await expect(speed).toBeVisible();
  await expect(speed).toHaveValue("129");
  await expect(speed).toHaveAttribute(
    "aria-valuetext",
    "129, reference setting",
  );
  await expect(page.getByTestId("selected-speed")).toHaveText(
    "129 · Reference",
  );
  await expect(
    page.getByLabel("Speed scope", { exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".native-speed-range")).toHaveCount(1);
  await expect(
    page
      .getByLabel("Animation preview", { exact: true })
      .locator(".native-speed-controls"),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".home-tabs")
      .evaluate((el) =>
        el.nextElementSibling?.classList.contains("native-speed-controls"),
      ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  const automatic = page.getByRole("checkbox", {
    name: "Automatically adjust preset cut timing",
    exact: true,
  });
  await expect(automatic).toBeVisible();
  await expect(automatic).toBeChecked();
  await automatic.uncheck();
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await expect(automatic).toHaveCount(0);
  await expect(speed).toBeVisible();
  await speed.press("End");
  await expect(speed).toHaveValue("255");
  await speed.press("Home");
  await expect(speed).toHaveValue("1");
  await speed.fill("65");
  await expect(page.getByTestId("selected-speed")).toHaveText("65");
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
  await page.getByRole("button", { name: "Save speed", exact: true }).click();
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
  await page.reload();
  await expect(speed).toHaveValue("65");
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  await expect(automatic).not.toBeChecked();
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Speed scope", { exact: true }).locator("option"),
  ).toHaveText([
    "Same speed for all animations",
    "Individual speed per animation",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Advanced Settings", { exact: true }).click();
  const tabBox = (await page.locator(".home-tabs").boundingBox())!,
    speedBox = (await controls.boundingBox())!,
    gridBox = (await page.locator("#home-custom-grid").boundingBox())!;
  expect(speedBox.y).toBeGreaterThanOrEqual(tabBox.y + tabBox.height);
  expect(speedBox.y + speedBox.height).toBeLessThan(gridBox.y);
  await page
    .locator(".home-presets-panel")
    .screenshot({ path: info.outputPath("main-speed-320.png") });
});

for (const output of ["simulation", "hardware", "combined"])
  for (const preset of ["basic", "custom"])
    test(`${output}: Main applies ${preset} speed deliberately through the current step`, async ({
      page,
    }) => {
      await mockBluetooth(page, true);
      await page.goto("./");
      await expect(page.locator("#home-view .home-status")).toHaveText(
        "2 of 2 connected",
      );
      await page
        .getByLabel("Playback output", { exact: true })
        .selectOption(output);
      await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-25T12:01:00Z"));
      await page
        .getByRole("tab", {
          name: preset === "basic" ? "Basic" : "Custom",
          exact: true,
        })
        .click();
      await page
        .locator(
          `[data-profile-id="${preset === "basic" ? "basic-4" : "overlap-cut"}"]`,
        )
        .click();
      const before = await page.evaluate(() => window.__ble.writes.length);
      const slider = page.getByRole("slider", {
        name: "Animation speed",
        exact: true,
      });
      for (const speed of [1, 65, 192]) await slider.fill(String(speed));
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(
        before,
      );
      expect(
        await page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("wrx-native-speed-preferences-v1") || "{}",
            ).globalSpeed ?? 129,
        ),
      ).toBe(129);
      // The sequence can advance while a speed is being chosen. Apply must
      // resolve the current step, not reissue the mode that began the drag.
      if (preset === "custom") await page.clock.runFor(1300);
      const mode = preset === "basic" ? 4 : 8;
      await page
        .getByRole("button", { name: "Apply speed", exact: true })
        .click();
      await page.clock.runFor(1);
      const hex = mode === 4 ? "9E0003C09800E9" : "9E0007C09800E9";
      const writes = await page.evaluate(() => window.__ble.writes);
      if (output === "simulation") expect(writes).toEqual([]);
      else
        expect(
          writes
            .filter((w) => w.hex === hex)
            .map((w) => w.side)
            .sort(),
        ).toEqual(["left", "right"]);
      if (output === "hardware")
        await expect(page.locator(".sim-art")).toHaveCount(0);
      else {
        await expect(page.locator(".sim-readout")).toHaveAttribute(
          "data-mode",
          String(mode),
        );
        await expect(page.locator(".sim-readout")).toContainText(
          "Active native byte: 0xC0",
        );
      }
      await expect(page.locator(".home-active-step")).toContainText(
        `Mode ${mode}`,
      );
      const effectiveMs =
        (preset === "basic" ? 2200 : 1300) * durationFactor(mode, 192);
      const appliedAt = await page.evaluate(() => performance.now());
      await page.clock.runFor(Math.floor(effectiveMs) - 3);
      const nextMode = preset === "basic" ? 4 : 7;
      if (output !== "simulation") {
        expect(
          await page.evaluate(
            ({ appliedAt, nextMode }) =>
              window.__ble.writes.filter(
                (w) =>
                  w.at > appliedAt &&
                  w.hex.startsWith(
                    `9E00${(nextMode - 1).toString(16).padStart(2, "0").toUpperCase()}`,
                  ),
              ).length,
            { appliedAt, nextMode },
          ),
        ).toBe(0);
      }
      await page.clock.runFor(5);
      await expect(page.locator(".home-active-step")).toContainText(
        `Mode ${nextMode}`,
      );
      await page
        .getByRole("button", { name: "Stop + Red", exact: true })
        .click();
      await page.clock.runFor(5000);
      const stopped = await page.evaluate(() => window.__ble.writes);
      if (output === "simulation") expect(stopped).toEqual([]);
      else
        expect(stopped.slice(-2).map((w) => w.hex)).toEqual([
          "56FF000000F0AA",
          "56FF000000F0AA",
        ]);
    });

test("individual saved speeds and corrections remain intact; Main Apply targets the animation playing now", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.addInitScript(() =>
    localStorage.setItem(
      "wrx-native-speed-preferences-v1",
      JSON.stringify({
        version: 2,
        scope: "per-mode",
        globalSpeed: 201,
        speeds: { 4: 65, 7: 129, 8: 129 },
        corrections: { 4: 1.25, 8: 1.5 },
        bundledFollow: true,
        previewTiming: { 4: true },
      }),
    ),
  );
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await expect(
    page.getByRole("slider", { name: "Animation speed", exact: true }),
  ).toHaveValue("65");
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T12:01:00Z"));
  await page.locator('[data-profile-id="overlap-cut"]').click();
  const slider = page.getByRole("slider", {
    name: "Animation speed",
    exact: true,
  });
  await expect(slider).toHaveValue("129");
  await slider.fill("192");
  await page.clock.runFor(1300);
  await expect(page.locator(".home-active-step")).toContainText("Mode 8");
  await page.getByRole("button", { name: "Apply speed", exact: true }).click();
  await page.clock.runFor(1);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wrx-native-speed-preferences-v1")!),
  );
  expect(saved).toMatchObject({
    scope: "per-mode",
    globalSpeed: 201,
    speeds: { 4: 65, 7: 129, 8: 192 },
    corrections: { 4: 1.25, 8: 1.5 },
    bundledFollow: true,
    previewTiming: { 4: true },
  });
  expect(
    await page.evaluate(
      () =>
        window.__ble.writes.filter((w) => w.hex === "9E0007C09800E9").length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(page.getByLabel("Speed scope", { exact: true })).toHaveValue(
    "per-mode",
  );
  await page
    .getByLabel("Speed scope", { exact: true })
    .selectOption({ label: "Same speed for all animations" });
  await expect(slider).toHaveValue("201");
  await page
    .getByLabel("Speed scope", { exact: true })
    .selectOption({ label: "Individual speed per animation" });
  await expect(slider).toHaveValue("65");
});
