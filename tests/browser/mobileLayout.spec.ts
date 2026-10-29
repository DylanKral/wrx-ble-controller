import { expect, test, type Page } from "@playwright/test";
import { mockBluetooth, navigate } from "./mockBluetooth";

async function anchored(page: Page) {
  await expect.poll(async () => page.locator(".global-playbar").evaluate(el => {
    const vv = visualViewport;
    return Math.abs(el.getBoundingClientRect().bottom - (vv ? vv.offsetTop + vv.height : innerHeight));
  })).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Stop + Red", exact: true })).toBeInViewport();
}

for (const width of [320, 375, 390, 430, 768])
  test(`all pages reserve the playback bar at ${width}px through scrolling, viewport resize and landscape`, async ({ page }, info) => {
    await mockBluetooth(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    const grid = page.locator("#home-custom-grid");
    await expect(grid.locator(".home-tile")).toHaveCount(11);
    expect((await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns)).split(" ")).toHaveLength(2);
    expect((await grid.boundingBox())!.y + 66).toBeLessThan((await page.locator(".global-playbar").boundingBox())!.y);
    for (const view of ["Main presets", "Custom Testing", "Calibration Mode"]) {
      if (view !== "Main presets") await navigate(page, view);
      for (const [position, fraction] of [["top", 0], ["middle", .5], ["bottom", 1]] as const) {
        await page.evaluate(fraction => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), fraction);
        await anchored(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${view}-${width}-${position}.png`) });
      }
      const barTop = (await page.locator(".global-playbar").boundingBox())!.y;
      const last = await page.locator("main:visible").evaluate(el => el.lastElementChild!.getBoundingClientRect().bottom);
      expect(last).toBeLessThanOrEqual(barTop - 8);
      for (const viewport of [{ width, height: 640 }, { width: 844, height: width }, { width, height: 844 }]) {
        await page.setViewportSize(viewport);
        await anchored(page);
      }
    }
  });

test("visual viewport toolbar and keyboard changes move the bar without accumulating an offset", async ({ page }) => {
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: vv });
  });
  await page.goto("./");
  await anchored(page);
  for (const [height, offsetTop] of [[740, 0], [780, 0], [420, 80], [844, 0], [844, 0]]) {
    await page.evaluate(({ height, offsetTop }) => {
      Object.assign(visualViewport!, { height, offsetTop });
      visualViewport!.dispatchEvent(new Event("resize"));
      visualViewport!.dispatchEvent(new Event("scroll"));
    }, { height, offsetTop });
    await anchored(page);
  }
  await page.getByRole("button", { name: "Stop + Red", exact: true }).click();
});

for (const width of [320, 375, 390, 430, 768])
  test(`compact preview sticks below navigation at ${width}px without restarting animation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await page.getByLabel("Playback output", { exact: true }).selectOption("simulation");
    await page.getByRole("tab", { name: "Basic", exact: true }).click();
    await page.locator('[data-profile-id="basic-5"]').click();
    const preview = page.locator(".sim-compact"), art = preview.locator("svg");
    await art.evaluate(el => { (window as any).__previewSvg = el; });
    for (const viewport of [{ width, height: 844 }, { width, height: 640 }, { width: 844, height: width }]) {
      await page.setViewportSize(viewport);
      for (const fraction of [.5, 1]) {
        await page.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction);
        await expect.poll(async () => preview.evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector(".site-nav")!.getBoundingClientRect().bottom))).toBeLessThanOrEqual(1);
        await expect(art).toHaveCSS("height", "90px");
        const box = (await art.boundingBox())!;
        expect(box.height).toBe(90);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThan((await page.locator(".global-playbar").boundingBox())!.y);
        expect(await art.evaluate(el => el === (window as any).__previewSvg)).toBe(true);
        await anchored(page);
      }
    }
    const slider = page.getByRole("slider", { name: "Animation speed", exact: true });
    await slider.scrollIntoViewIfNeeded();
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue("60");
    await expect(page.locator(".sim-readout")).toHaveAttribute("data-mode", "5");
  });

test("returning to the browser clears the hidden-page status and never resumes hardware playback", async ({ page }) => {
  await mockBluetooth(page, true);
  await page.goto("./");
  await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
  await page.locator('[data-profile-id="overlap-cut"]').click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".global-playbar")).toHaveAttribute("data-profile", "");
  const count = await page.evaluate(() => window.__ble.writes.length);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await page.getByText("Connection status", { exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Browser active. Playback remains stopped");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__ble.writes.length)).toBe(count);
  await anchored(page);
});
