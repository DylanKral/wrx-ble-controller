import { expect, test } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";
import { durationFactor } from "../../src/animations/timing";

test("linked speed defaults remain 81 and intermediate requests share the selected byte and timing", async ({
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
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("129");
  await expect(page.getByLabel("Speed scope", { exact: true })).toHaveValue(
    "global",
  );
  await expect(
    page.getByLabel("Automatically adjust preset cut timing", {
      exact: true,
    }),
  ).toBeChecked();
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
      await expect(page.getByTestId("timing-estimate")).toContainText(
        "provisional curve",
      );
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
  await page.getByText("Advanced Settings", { exact: true }).click();
  await page
    .getByLabel("Native speed mode", { exact: true })
    .selectOption("10");
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("192");
  await expect(page.getByLabel("Speed scope", { exact: true })).toHaveValue(
    "global",
  );
});

test("Simulation Only speed changes never write and leave saved manual Custom timing intact", async ({
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
  await page.getByText("Advanced Settings", { exact: true }).click();
  await page.getByLabel("Native speed byte", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Apply speed and reissue mode", exact: true })
    .click();
  await expect(page.locator(".sim-readout")).toContainText("2.243×");
  expect(
    await page.evaluate(() => localStorage.getItem("wrx-dream-studio-v7")),
  ).toBe(saved);
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
  await page.getByLabel("Native speed mode", { exact: true }).selectOption("7");
  await expect(page.getByTestId("timing-estimate")).toContainText(
    "Estimated curve · unmeasured mode",
  );
  await expect(
    page.getByLabel("Follow Animation Speed for this profile", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByTestId("step-1-timing")).toHaveText(
    "Fixed time: 1.30s · unchanged",
  );
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
  await page.getByText("Advanced Settings", { exact: true }).click();
  await page.getByLabel("Native speed byte", { exact: true }).fill("65");
  await navigate(page, "Calibration Mode");
  await page.getByRole("button", { name: /^M04 · Mode 4 / }).click();
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("slider", { name: "Animation speed", exact: true }),
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

test("Studio shows live original/effective cuts, keeps old personal profiles fixed, and preserves independent speeds", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "wrx-native-speed-preferences-v1",
      JSON.stringify({ version: 1, speeds: { 7: 1, 8: 255 } }),
    );
    localStorage.setItem(
      "wrx-dream-studio-v7",
      JSON.stringify({
        version: 9,
        selectedId: "saved-personal",
        profiles: [
          {
            id: "saved-personal",
            name: "My existing cuts",
            repeat: false,
            experimental: false,
            steps: [
              { type: "mode", mode: 7, ms: 1300 },
              { type: "mode", mode: 8, ms: 1300 },
            ],
          },
        ],
      }),
    );
  });
  await page.goto("./#development");
  await page.getByText("Advanced Settings", { exact: true }).click();
  await expect(page.getByLabel("Speed scope", { exact: true })).toHaveValue(
    "per-mode",
  );
  await expect(
    page.getByLabel("Follow Animation Speed for this profile", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByTestId("step-1-timing")).toHaveText(
    "Fixed time: 1.30s · unchanged",
  );
  await page
    .getByLabel("Profile to edit", { exact: true })
    .selectOption("overlap-cut");
  await expect(page.getByTestId("step-1-timing")).toContainText(
    `Original Cut: 1.30s · Effective Cut: ${(1.3 * durationFactor(7, 1)).toFixed(3)}s`,
  );
  await expect(page.getByTestId("step-2-timing")).toContainText(
    `Effective Cut: ${(1.3 * durationFactor(8, 255)).toFixed(3)}s`,
  );
  await page.getByLabel("Speed scope", { exact: true }).selectOption("global");
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("129");
  await expect(page.getByTestId("step-1-timing")).toContainText(
    "Effective Cut: 1.300s",
  );
  await expect(page.getByTestId("step-2-timing")).toContainText(
    "Effective Cut: 1.300s",
  );
  await page.getByLabel("Animation speed", { exact: true }).fill("192");
  await page.getByRole("button", { name: "Save speed", exact: true }).click();
  for (const step of [1, 2])
    await expect(page.getByTestId(`step-${step}-timing`)).toContainText(
      `Effective Cut: ${(1.3 * durationFactor(7, 192)).toFixed(3)}s`,
    );
  await page
    .getByLabel("Automatically adjust preset cut timing", {
      exact: true,
    })
    .uncheck();
  await expect(page.getByTestId("step-1-timing")).toHaveText(
    "Fixed time: 1.30s · unchanged",
  );
  await page
    .getByLabel("Profile to edit", { exact: true })
    .selectOption("saved-personal");
  await page
    .getByLabel("Follow Animation Speed for this profile", { exact: true })
    .check();
  await expect(page.getByTestId("step-1-timing")).toContainText(
    "Original Cut: 1.30s",
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wrx-dream-studio-v7")!),
  );
  expect(stored.profiles[0]).toMatchObject({
    followAnimationSpeed: true,
    steps: [
      { type: "mode", mode: 7, ms: 1300 },
      { type: "mode", mode: 8, ms: 1300 },
    ],
  });
  await page
    .getByLabel("Speed scope", { exact: true })
    .selectOption("per-mode");
  await page.getByLabel("Native speed mode", { exact: true }).selectOption("7");
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("1");
  await page.getByLabel("Native speed mode", { exact: true }).selectOption("8");
  await expect(
    page.getByLabel("Native speed byte", { exact: true }),
  ).toHaveValue("255");
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
});

test("expanded speed and Studio timing controls fit a 320px screen", async ({
  page,
}, info) => {
  await mockBluetooth(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("./#development");
  await page.getByText("Advanced Settings", { exact: true }).click();
  await page.getByText("Timing model correction", { exact: true }).click();
  await page
    .getByLabel("Profile to edit", { exact: true })
    .selectOption("overlap-cut");
  await page.getByLabel("Native speed byte", { exact: true }).fill("192");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByTestId("step-1-timing")).toContainText(
    "Original Cut: 1.30s",
  );
  await page.screenshot({
    path: info.outputPath("speed-controls-320.png"),
    fullPage: true,
  });
});

test("Breathe measured favorite timing saves and survives refresh without rounding", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.goto("./#development");
  await page.getByLabel("Factory mode (1–256)", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Use measured timing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save favorite + timing", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wrx-dream-presets-v5") || "{}")
            .presets?.[0]?.fullMs,
      ),
    )
    .toBe(3540);
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wrx-dream-presets-v5")!),
  );
  expect(saved.presets[0]).toMatchObject({
    mode: 10,
    kind: "continuous",
    fullMs: 3540,
  });
});

test("active Apply rebases the Custom cut while future edits wait for the next step, then Stop + Red cancels", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  // Keep browser actions and CI host load from advancing the deadline under test.
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T12:01:00Z"));
  await page.getByText("Advanced Settings", { exact: true }).click();
  await page.getByLabel("Native speed mode", { exact: true }).selectOption("7");
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await page.clock.runFor(600);
  await page.getByLabel("Native speed byte", { exact: true }).fill("255");
  expect(
    await page.evaluate(
      () => window.__ble.writes.filter((w) => w.hex.startsWith("9E")).length,
    ),
  ).toBe(2);
  await page
    .getByRole("button", { name: "Apply speed and reissue mode", exact: true })
    .click();
  await page.clock.runFor(10);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "9E0006FF9800E9").length,
      ),
    )
    .toBe(2);
  const cutMs = 1300 * durationFactor(7, 255);
  await page.clock.runFor(Math.floor(cutMs) - 30);
  expect(
    await page.evaluate(
      () =>
        window.__ble.writes.filter((w) => w.hex === "9E0007FF9800E9").length,
    ),
  ).toBe(0);
  await page.clock.runFor(40);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "9E0007FF9800E9").length,
      ),
    )
    .toBe(2);
  const transitionWrites = await page.evaluate(() =>
    window.__ble.writes.filter((w) => w.side === "left"),
  );
  const reapplied = transitionWrites.find((w) => w.hex === "9E0006FF9800E9")!;
  const transitioned = transitionWrites.find(
    (w) => w.hex === "9E0007FF9800E9",
  )!;
  expect(transitioned.at - reapplied.at).toBeGreaterThanOrEqual(cutMs);
  expect(transitioned.at - reapplied.at).toBeLessThan(cutMs + 2);
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await page.clock.runFor(5000);
  const writes = await page.evaluate(() => window.__ble.writes);
  expect(writes.filter((w) => w.hex.startsWith("9E"))).toHaveLength(6);
  expect(writes.slice(-2).map((w) => w.hex)).toEqual([
    "56FF000000F0AA",
    "56FF000000F0AA",
  ]);
  await expect(page.locator(".sim-readout")).toHaveAttribute(
    "data-mode",
    "static",
  );
});

test("Combined reports independent side failures while Breathe sends once and its partial preview holds", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page.evaluate(() => {
    window.__ble.failSide = "right";
  });
  await page.clock.install();
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-10"]').click();
  await page.clock.runFor(10000);
  await expect(
    page.getByLabel("Playback delivery", { exact: true }),
  ).toContainText("Left: sent · Right: error");
  await expect(
    page.getByLabel("Playback delivery", { exact: true }),
  ).toContainText("Mock radio failure");
  await expect(page.locator(".home-active-step")).toContainText("Breathe");
  const readout = page.locator(".sim-readout");
  await expect(readout).toHaveAttribute("data-mode", "10");
  await expect(readout).toContainText("2.500 / 2.500s");
  expect(
    await page.evaluate(
      () =>
        window.__ble.writes.filter((w) => w.hex === "9E0009819800E9").length,
    ),
  ).toBe(1);
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Repeat captured preview window" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await page.evaluate(() => {
    window.__ble.disconnect("left");
    window.__ble.disconnect("right");
  });
  await page.locator('[data-profile-id="basic-4"]').click();
  await page.clock.runFor(100);
  await expect(
    page.getByLabel("Playback delivery", { exact: true }),
  ).toContainText("Left: disconnected · Right: disconnected");
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "4");
});
