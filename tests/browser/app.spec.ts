import { expect, test } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";
import { readFile } from "node:fs/promises";

test("mobile Main retains the fixed preset grid, Basic modes, tabs, colors, and Stop + Red", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockBluetooth(page);
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Lighting presets" }),
  ).toBeVisible();
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(10);
  for (const id of ["blue-overlap", "basic-chase", "flash"]) {
    await expect(
      page.locator(`#home-custom-grid [data-profile-id="${id}"]`),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Stop + Red", exact: true }),
  ).toBeInViewport();
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await expect(page.locator("#home-basic-grid .home-tile")).toHaveCount(8);
  await expect(page.locator("#home-basic-grid")).toBeVisible();
  await page.getByLabel("Static RGB color").fill("#123456");
  await page.reload();
  await expect(page.getByLabel("Static RGB color")).toHaveValue("#123456");
  await expect(
    page.getByRole("tab", { name: "Basic", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  await page.getByLabel("Rainbow Chase starting color").fill("#1234ab");
  await page.reload();
  await expect(page.getByLabel("Rainbow Chase starting color")).toHaveValue(
    "#1234ab",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("main-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("dual controllers connect, collapse the panel, retain connections across navigation, and send verified packets", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.goto("./");
  await page
    .getByRole("button", { name: "Connect left", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("button", { name: "Connect right", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator("#home-view .home-connect-panel")).not.toHaveAttribute("open");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page.getByLabel("Static RGB color").fill("#0000ff");
  await page
    .getByRole("button", { name: "Apply color", exact: true })
    .filter({ visible: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "560000FF00F0AA").length,
      ),
    )
    .toBe(2);
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-4"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "9E0003819800E9").length,
      ),
    )
    .toBe(2);
  await expect(page.locator(".home-active-step")).toContainText("Mode 4");
  await navigate(page, "Custom Testing");
  await expect(
    page.getByRole("heading", { name: "Profile studio" }),
  ).toBeVisible();
  await expect(
    page.locator("#controller-view .status").filter({ hasText: "Connected" }),
  ).toHaveCount(2);
  await navigate(page, "Calibration Mode");
  await expect(page.locator("#calibration-view .test-btn")).toHaveCount(15);
  await expect(
    page.locator("#calibration-view .status").filter({ hasText: "Connected" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "56FF000000F0AA").length,
      ),
    )
    .toBe(2);
});

test("authorized-device restore, internally looping mode, disconnect and automatic recovery work", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-5"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__ble.writes.length))
    .toBe(2);
  await page.waitForTimeout(4500);
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(2);
  await page.evaluate(() => window.__ble.disconnect("left"));
  await expect(page.locator("#home-view .home-connect-panel")).toHaveAttribute("open", "");
  await expect(page.locator(".home-active-step")).toContainText("Idle");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
});

test("fixed presets stay immutable while duplicate profile editing, step tools and button assignments persist", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.goto("./#development");
  await expect(page.getByLabel("Profile name", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Duplicate profile", exact: true })
    .click();
  await page.getByLabel("Profile name", { exact: true }).fill("My overlap");
  await page.getByRole("button", { name: "+ Wait", exact: true }).click();
  await page.getByLabel("Step 3 duration", { exact: true }).fill("0.15");
  await page.getByLabel("Step 3 duration", { exact: true }).blur();
  await page
    .getByRole("button", { name: "Duplicate step 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move step 4 up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove step 3", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add button", exact: true }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue(
    "My overlap",
  );
  await expect(page.getByLabel("Step 3 duration", { exact: true })).toHaveValue(
    "0.15",
  );
  await navigate(page, "Main presets");
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(11);
  await expect(
    page.locator('[data-profile-id="overlap-double"] strong'),
  ).toHaveText("Infinite Overlap");
  await expect(page.getByRole("button", { name: /My overlap/ })).toBeVisible();
});

test("existing v7 data, calibration history and user button labels survive initialization and refresh", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("seeded")) {
      localStorage.setItem("seeded", "yes");
      localStorage.setItem(
        "wrx-dream-studio-v7",
        JSON.stringify({
          version: 7,
          profiles: [
            {
              id: "old-custom",
              name: "My old profile",
              repeat: true,
              experimental: false,
              steps: [{ type: "mode", mode: 8, ms: 1350 }],
            },
          ],
          buttons: [
            {
              id: "my-old-button",
              label: "My old button",
              profileId: "old-custom",
            },
          ],
          selectedId: "old-custom",
        }),
      );
      localStorage.setItem(
        "wrx-calibration-logs-v1",
        JSON.stringify([{ event: "old_record", date_utc: "2026-01-01" }]),
      );
    }
  });
  await page.goto("./");
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(11);
  await expect(
    page.getByRole("button", { name: /My old button/ }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Custom Testing");
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue(
    "My old profile",
  );
  await expect(page.getByLabel("Step 1 duration", { exact: true })).toHaveValue(
    "1.35",
  );
  await navigate(page, "Calibration Mode");
  await expect(
    page.locator("#calibration-view .pill").filter({ hasText: "1 events" }),
  ).toBeVisible();
});

test("calibration writes command timing, exports CSV and JSON, and keeps history after navigation", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./#calibration");
  await expect(
    page.locator("#calibration-view .status").filter({ hasText: "Connected" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: /^M04 · Mode 4 / }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("wrx-calibration-logs-v1") || "[]",
          ).filter(
            (e: { event: string; mode: number }) =>
              e.event === "write_completed" && e.mode === 4,
          ).length,
      ),
    )
    .toBe(2);
  await expect(page.getByLabel("Test elapsed time")).not.toHaveText("00:00.00");
  await page.getByRole("button", { name: "Stop test", exact: true }).click();
  for (const ext of ["CSV", "JSON"]) {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download " + ext, exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(
      new RegExp("\\." + ext.toLowerCase() + "$"),
    );
  }
  const count = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("wrx-calibration-logs-v1") || "[]")
        .length,
  );
  await navigate(page, "Main presets");
  await navigate(page, "Calibration Mode");
  await expect(
    page
      .locator("#calibration-view .pill")
      .filter({ hasText: count + " events" }),
  ).toBeVisible();
});

test("unsupported Bluetooth is reported without claiming success", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Connect left", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Bluetooth unavailable");
});

test("BLE failure stops playback and reports the failed controller", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await page.evaluate(() => (window.__ble.fail = true));
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await expect(page.locator(".home-active-step")).toContainText("Idle");
  await expect(page.getByRole("status")).toContainText("failed");
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(0);
});

test("blocked localStorage keeps Bluetooth controls and editable session profiles available", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    }),
  );
  await page.goto("./");
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(10);
  await expect(page.locator("#home-view [role=alert]")).toContainText(
    "Browser storage is unavailable",
  );
  await expect(page.locator("#home-view .home-status")).toHaveText(
    "2 of 2 connected",
  );
  await navigate(page, "Custom Testing");
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await page
    .getByLabel("Profile name", { exact: true })
    .fill("Session profile");
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue(
    "Session profile",
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete backup", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe(
    "wrx_configuration_backup.json",
  );
});

test("favorite manual timing, early cut, selected slot and named playlist persist", async ({
  page,
}) => {
  await mockBluetooth(page);
  await page.goto("./#development");
  await page
    .getByLabel("Favorite name", { exact: true })
    .fill("My timed chase");
  await page
    .getByLabel("Full duration / cycle (seconds)", { exact: false })
    .fill("2.65");
  await page
    .getByLabel("Sequence transition", { exact: true })
    .selectOption("cut");
  await page.getByLabel("Cut at (seconds)", { exact: false }).fill("1.30");
  await page
    .getByRole("button", { name: "Save favorite + timing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New blank playlist", exact: true })
    .click();
  await page.getByLabel("Add a favorite", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByLabel("Add a favorite", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByRole("button", { name: "Move playlist step 2 up", exact: true })
    .click();
  await page.getByLabel("Playlist name", { exact: true }).fill("My sequence");
  await page
    .locator("#dev-playlists")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Favorite name", { exact: true })).toHaveValue(
    "My timed chase",
  );
  await expect(
    page.getByLabel("Full duration / cycle (seconds)", { exact: false }),
  ).toHaveValue("2.65");
  await expect(
    page.getByLabel("Cut at (seconds)", { exact: false }),
  ).toHaveValue("1.30");
  await expect(page.getByLabel("Playlist name", { exact: true })).toHaveValue(
    "My sequence",
  );
  await expect(
    page.locator("#dev-playlists .seq-item strong").first(),
  ).toContainText("Overlap");
});

test("complete backup downloads raw existing data and restores configuration", async ({
  page,
}, info) => {
  await mockBluetooth(page);
  await page.goto("./#development");
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await page.getByLabel("Profile name", { exact: true }).fill("Backup profile");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete backup", exact: true })
    .click();
  const download = await downloaded;
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.format).toBe("WRX_Configuration_v1");
  expect(JSON.parse(data.values["wrx-dream-studio-v7"]).profiles[0].name).toBe(
    "Backup profile",
  );
  const backupPath = info.outputPath("backup.json");
  await download.saveAs(backupPath);
  await page.getByLabel("Profile name", { exact: true }).fill("Changed later");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue(
    "Backup profile",
  );
});

test("Main retains the original layout and theme with the requested preset removals", async ({
  page,
}, info) => {
  await mockBluetooth(page);
  await page.goto("tests/fixtures/original-v8.2.html");
  const measure = () =>
    page.evaluate(() => {
      const main = document.getElementById("home-view")!,
        grid = document.getElementById("home-custom-grid")!;
      return {
        width: main.getBoundingClientRect().width,
        columns: getComputedStyle(grid).gridTemplateColumns,
        theme: getComputedStyle(document.documentElement).getPropertyValue(
          "--bg",
        ),
        labels: Array.from(
          grid.querySelectorAll(".home-tile strong"),
          (el) => el.textContent,
        ),
      };
    });
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(13);
  const original = await measure();
  original.labels = original.labels.filter(
    (label) => !["Blue Overlap", "Chase", "Flash"].includes(label || ""),
  );
  await page.screenshot({
    path: info.outputPath("original-main.png"),
    fullPage: true,
  });
  await page.goto("./");
  await expect(page.locator("#home-custom-grid .home-tile")).toHaveCount(10);
  expect(await measure()).toEqual(original);
  await page.screenshot({
    path: info.outputPath("react-main.png"),
    fullPage: true,
  });
});

for (const width of [320, 390, 768])
  test(`all views avoid horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await mockBluetooth(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    for (const view of ["Main presets", "Custom Testing", "Calibration Mode"]) {
      if (view !== "Main presets") await navigate(page, view);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Stop + Red", exact: true }),
      ).toBeInViewport();
    }
  });
