import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

// Render only local analysis HTML/SVG; no app or Bluetooth access is involved.
const output = resolve(process.argv[2] ?? "docs/analysis/native-overlap");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  await page.goto(pathToFileURL(join(output, "comparison.html")).href);
  for (const [index, mode] of [
    [2, 7],
    [5, 8],
  ]) {
    await page
      .locator("article")
      .nth(index)
      .screenshot({ path: join(output, `mode-${mode}-fast-comparison.png`) });
  }
  console.log("Rendered both fast-setting physical/SVG comparisons.");
} finally {
  await browser.close();
}
