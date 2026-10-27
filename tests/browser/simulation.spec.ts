import { expect, test, type Page } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";

async function seek(page: Page, selector: string, seconds: number) {
  await page.locator(selector).evaluate((element, time) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, String(time));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, seconds);
}
async function ledColors(page: Page, side = "left") {
  return page
    .locator(`#${side}-leds .led`)
    .evaluateAll((nodes) =>
      nodes
        .sort(
          (a, b) =>
            Number(a.getAttribute("data-led-number")) -
            Number(b.getAttribute("data-led-number")),
        )
        .map((node) => node.getAttribute("fill")),
    );
}
test("Mode 4 and Mode 10 match approved HTML colors for red, blue and green at multiple frames", async ({
  page,
}, info) => {
  await mockBluetooth(page);
  const samples: {
    mode: number;
    color: string;
    time: number;
    colors: (string | null)[];
  }[] = [];
  await page.goto("Animations/approved-mode-4-10-preview.html");
  for (const mode of [4, 10])
    for (const color of ["#ff0000", "#0000ff", "#00ff48"])
      for (const time of [0.4, 1.1, 1.8]) {
        await page.locator("#mode" + mode).click();
        await page.locator("#picker").fill(color);
        await seek(page, "#timeline", time);
        samples.push({ mode, color, time, colors: await ledColors(page) });
      }
  await page.goto("./#development");
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("simulation");
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  for (const sample of samples) {
    await page
      .getByLabel("Preview factory mode", { exact: true })
      .selectOption(String(sample.mode));
    await page
      .getByLabel("Preview RGB color", { exact: true })
      .fill(sample.color);
    await seek(page, "input[aria-label='Preview time']", sample.time);
    await expect.poll(() => ledColors(page)).toEqual(sample.colors);
    expect(await ledColors(page, "right")).toEqual(sample.colors);
    if (sample.mode === 10)
      await expect(
        page.getByText("Approved enhanced Breathe fade · on · 100%", {
          exact: true,
        }),
      ).toBeVisible();
  }
  expect(await page.locator("#artboard").getAttribute("viewBox")).toBe(
    "0 0 1480 485",
  );
  await page.screenshot({
    path: info.outputPath("approved-calibrated-preview.png"),
    fullPage: true,
  });
});

test("all eight tracks render all 38 LED regions and numbered indicators consistently on mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockBluetooth(page);
  await page.goto("./#development");
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("simulation");
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  for (const mode of [3, 4, 5, 6, 7, 8, 9, 10]) {
    await page
      .getByLabel("Preview factory mode", { exact: true })
      .selectOption(String(mode));
    await seek(page, "input[aria-label='Preview time']", 0.215);
    await expect(page.locator(".sim-readout")).toHaveAttribute(
      "data-mode",
      String(mode),
    );
    await expect(page.locator(".sim-art .led")).toHaveCount(38);
    expect(await ledColors(page, "left")).toEqual(
      await ledColors(page, "right"),
    );
    expect(
      await page.locator(".sim-led-grid li").evaluateAll((nodes) =>
        nodes.every((node) => {
          const number = node.getAttribute("data-led-number");
          const left = document.querySelector(
            `#left-leds .led[data-led-number='${number}']`,
          )!;
          const right = document.querySelector(
            `#right-leds .led[data-led-number='${number}']`,
          )!;
          const color = getComputedStyle(
            node.querySelector("i")!,
          ).backgroundColor;
          return (
            getComputedStyle(left).fill === color &&
            getComputedStyle(right).fill === color
          );
        }),
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Simulation Only never sends Bluetooth for presets, static RGB, favorites, playlists, inspection or Stop", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .connection-action .dot.on")).toHaveCount(2);
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("simulation");
  await page.getByLabel("Static RGB color").fill("#00ff48");
  await page
    .getByRole("button", { name: "Apply color", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-4"]').click();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "4");
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "8");
  await navigate(page, "Custom Testing");
  await page
    .getByRole("button", { name: "Play selected once", exact: true })
    .click();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "4");
  await page
    .getByRole("button", { name: "Play sequence", exact: true })
    .click();
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  await page
    .getByLabel("Preview factory mode", { exact: true })
    .selectOption("10");
  await seek(page, "input[aria-label='Preview time']", 1);
  await page.getByRole("button", { name: "Next frame", exact: true }).click();
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await navigate(page, "Calibration Mode");
  await expect(
    page.getByRole("button", { name: /^M04 · Mode 4 / }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reset static blue", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
});

test("Combined previews and writes unchanged commands, while Hardware Only does not render live previews", async ({
  page,
}) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator("#home-view .connection-action .dot.on")).toHaveCount(2);
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("combined");
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-4"]').click();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "4");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "9E0003819800E9").length,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ble.writes.filter((w) => w.hex === "56FF000000F0AA").length,
      ),
    )
    .toBe(2);
  await page
    .getByLabel("Playback output", { exact: true })
    .selectOption("hardware");
  await expect(page.locator("#artboard")).toHaveCount(0);
});

test("preview state and remembered RGB survive navigation and settings survive refresh without Bluetooth", async ({
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
    .getByLabel("Playback output", { exact: true })
    .selectOption("simulation");
  await page.getByLabel("Static RGB color").fill("#00ff48");
  await page.getByRole("tab", { name: "Basic", exact: true }).click();
  await page.locator('[data-profile-id="basic-10"]').click();
  await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "10");
  await navigate(page, "Custom Testing");
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  await expect(
    page.getByLabel("Preview RGB color", { exact: true }),
  ).toHaveValue("#00ff48");
  await page.reload();
  await expect(page.getByLabel("Playback output", { exact: true })).toHaveValue(
    "simulation",
  );
  await page
    .getByText("Preview controls and numbered LEDs", { exact: true })
    .click();
  await expect(
    page.getByLabel("Preview RGB color", { exact: true }),
  ).toHaveValue("#00ff48");
});
