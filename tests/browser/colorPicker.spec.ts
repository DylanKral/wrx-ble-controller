import { expect, test } from "@playwright/test";
import { mockBluetooth, chooseSolidColor } from "./mockBluetooth";

for (const width of [320, 375, 390, 430, 768])
  test(`solid colors and a precise color wheel fit ${width}px and stay synchronized`, async ({ page }, info) => {
    await mockBluetooth(page, true);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await expect(page.locator(".connection-action .dot.on")).toHaveCount(2);
    const panel = page.getByLabel("Static RGB control", { exact: true });
    const palette = panel.getByRole("group", { name: "Basic colors", exact: true });
    await expect(palette.getByRole("button")).toHaveCount(10);
    const blue = palette.getByRole("button", { name: "Blue solid color", exact: true });
    await blue.click();
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Static RGB color", { exact: true })).toHaveValue("#0000ff");
    expect(await page.evaluate(() => window.__ble.writes)).toEqual([]);
    await panel.getByRole("button", { name: "Apply color", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__ble.writes.map(write => write.hex))).toEqual(["560000FF00F0AA", "560000FF00F0AA"]);
    const before = await page.evaluate(() => window.__ble.writes.length);
    await panel.locator(".custom-color-tools > summary").click();
    const wheel = page.getByTestId("color-wheel");
    await wheel.scrollIntoViewIfNeeded();
    const box = (await wheel.boundingBox())!;
    // Opposite the red top edge, the wheel selects cyan. The ring remains
    // draggable while pointer capture keeps movement inside this control.
    await page.mouse.move(box.x + box.width / 2, box.y + 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2, { steps: 8 });
    await page.mouse.up();
    const picked = await page.getByLabel("Static RGB color", { exact: true }).inputValue();
    expect(picked).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseInt(picked.slice(1, 3), 16)).toBeLessThan(15);
    expect(parseInt(picked.slice(3, 5), 16)).toBeGreaterThan(245);
    expect(parseInt(picked.slice(5, 7), 16)).toBeGreaterThan(245);
    await page.getByRole("slider", { name: "Color hue", exact: true }).press("Home");
    await page.getByRole("slider", { name: "Color saturation", exact: true }).press("End");
    await page.getByRole("slider", { name: "Color brightness", exact: true }).fill("50");
    await expect(page.getByLabel("Static RGB color", { exact: true })).toHaveValue("#800000");
    await chooseSolidColor(page, "#123456");
    expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before);
    await page.getByLabel("Playback output", { exact: true }).selectOption("simulation");
    await panel.getByRole("button", { name: "Apply color", exact: true }).click();
    expect(await page.evaluate(() => window.__ble.writes.length)).toBe(before);
    await expect(page.locator(".sim-art .led").first()).toHaveAttribute("fill", "#123456");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await palette.getByRole("button").all()) {
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
    await panel.screenshot({ path: info.outputPath(`solid-color-wheel-${width}.png`) });
    await page.reload();
    await expect(page.getByLabel("Static RGB color", { exact: true })).toHaveValue("#123456");
    await expect(page.getByLabel("Playback output", { exact: true })).toHaveValue("simulation");
  });
