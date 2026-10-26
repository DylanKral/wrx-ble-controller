import { expect, test } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";

test("native speed defaults remain 81, intermediate requests use the chosen byte, and mapping remains opt-in", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("combined");
  await page.getByText("Native animation speed", { exact: true }).click();
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("129");
  await expect(
    page.getByLabel("Use provisional timing for Mode 4", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Apply speed and reissue mode", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "9E0003819800E9").length,
      ),
    )
    .toBe(2);
  for (const mode of [4, 10])
    for (const speed of [65, 192]) {
      await page
        .getByLabel("Native speed mode", { exact: true })
        .selectOption(String(mode));
      await page
        .getByLabel("Native speed byte", { exact: true })
        .fill(String(speed));
      const before = await page.evaluate(() => window.__ble.writes.length);
      await page
        .getByLabel(`Use provisional timing for Mode ${mode}`, { exact: true })
        .check();
      expect(await page.evaluate(() => window.__ble.writes.length)).toBe(
        before,
      );
      await page
        .getByRole("button", {
          name: "Apply speed and reissue mode",
          exact: true,
        })
        .click();
      const packet = [0x9e, 0, mode - 1, speed, 0x98, 0, 0xe9]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      await expect
        .poll(() =>
          page.evaluate(
            (hex) => window.__ble.writes.filter((w) => w.hex === hex).length,
            packet,
          ),
        )
        .toBe(2);
      await expect(page.locator(".sim-readout")).toContainText(
        `Active native byte: 0x${speed.toString(16).toUpperCase()}`,
      );
    }
  await expect(
    page.getByText(/Mode 10 remains a 2.50s captured window/),
  ).toBeVisible();
  await page.reload();
  await page.getByText("Native animation speed", { exact: true }).click();
  await page
    .getByLabel("Native speed mode", { exact: true })
    .selectOption("10");
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("192");
  await expect(
    page.getByLabel("Use provisional timing for Mode 10", { exact: true }),
  ).toBeChecked();
});

test("Simulation Only speed changes and model switches never write and leave saved Custom timing intact", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./#development");
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await page
    .getByLabel("Profile name", { exact: true })
    .fill("My original timing");
  await page.getByLabel("Step 1 duration", { exact: true }).fill("1.30");
  await page.getByLabel("Step 1 duration", { exact: true }).blur();
  const saved = await page.evaluate(() =>
    localStorage.getItem("wrx-dream-studio-v7"),
  );
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("simulation");
  await page.getByText("Native animation speed", { exact: true }).click();
  await page.getByLabel("Native speed byte", { exact: true }).fill("1");
  await page
    .getByLabel("Use provisional timing for Mode 4", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Apply speed and reissue mode", exact: true })
    .click();
  await expect(page.locator(".sim-readout")).toContainText("2.243×");
  expect(
    await page.evaluate(() => localStorage.getItem("wrx-dream-studio-v7")),
  ).toBe(saved);
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
  await page.getByLabel("Native speed mode", { exact: true }).selectOption("7");
  await expect(
    page.getByLabel("Use provisional timing for Mode 7", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "No speed-to-time measurements are available for this mode. Its preview timing is unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("calibration logs the chosen native byte and locks speed editing during the recording", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("combined");
  await page.getByText("Native animation speed", { exact: true }).click();
  await page.getByLabel("Native speed byte", { exact: true }).fill("65");
  await navigate(page, "Calibration Mode");
  await page.getByRole("button", { name: /^M04 · Mode 4 / }).click();
  await page.getByText("Native animation speed", { exact: true }).click();
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("wrx-calibration-logs-v1") || "[]",
          ).filter(
            (row: {
              event: string;
              mode: number;
              native_speed: number;
              hex: string;
            }) =>
              row.event === "command_request" &&
              row.mode === 4 &&
              row.native_speed === 65 &&
              row.hex === "9E0003419800E9",
          ).length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Stop test", exact: true }).click();
});
